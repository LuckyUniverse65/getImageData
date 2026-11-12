use std::{env, fs, path::PathBuf, process::Command};

fn main() {
    let platform = env::var("CARGO_CFG_TARGET_OS").unwrap();
    assert!(platform == "windows" || platform == "linux", "Only Windows and Linux are supported");
    assert_eq!(env::var("CARGO_CFG_TARGET_ARCH").unwrap(), "x86_64", "Only x64 is supported");
    let root = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let out = PathBuf::from(env::var("OUT_DIR").unwrap());
    for key in ["CANVAS_VCVARS", "CANVAS_CLANG_ROOT", "CANVAS_SKIA_ROOT", "CANVAS_SKIA_OUT", "CANVAS_MACHINE_CONFIG", "CANVAS_NODE"] {
        println!("cargo:rerun-if-env-changed={key}");
    }
    for file in ["index.js", "src/dommatrix.js", "src/skia_backend.cpp", "src/linux_fontconfig.h", "src/render_diagnostics.h", "scripts/bundle-canvas.cjs", "scripts/prepare-native.cjs", "node_modules/@petamoriken/float16/browser/float16.js"] {
        println!("cargo:rerun-if-changed={}", root.join(file).display());
    }
    if let Ok(config) = env::var("CANVAS_MACHINE_CONFIG") { println!("cargo:rerun-if-changed={config}"); }
    let node = env::var("CANVAS_NODE").unwrap_or_else(|_| "node".into());
    let prepared = Command::new(node).arg(root.join("scripts/prepare-native.cjs")).arg(&out).status().expect("start Node build preparation");
    assert!(prepared.success(), "Canvas bundle/config generation failed; run npm ci first");

    if platform == "linux" {
        build_linux(&root, &out);
        return;
    }

    let vcvars = if let Ok(value) = env::var("CANVAS_VCVARS") { PathBuf::from(value) } else {
        let vswhere = PathBuf::from(env::var("ProgramFiles(x86)").expect("ProgramFiles(x86) is missing"))
            .join("Microsoft Visual Studio/Installer/vswhere.exe");
        let result = Command::new(vswhere).args(["-latest", "-products", "*", "-requires", "Microsoft.VisualStudio.Component.VC.Tools.x86.x64", "-property", "installationPath"])
            .output().expect("Install Visual Studio C++ Build Tools or set CANVAS_VCVARS");
        let installation = String::from_utf8_lossy(&result.stdout).trim().to_owned();
        assert!(!installation.is_empty(), "Visual Studio C++ tools were not found");
        PathBuf::from(installation).join("VC/Auxiliary/Build/vcvars64.bat")
    };
    let clang_root = env::var_os("CANVAS_CLANG_ROOT").map(PathBuf::from).unwrap_or(root.join("third_party/chrome153-clang"));
    let skia_root = env::var_os("CANVAS_SKIA_ROOT").map(PathBuf::from).unwrap_or(root.join("third_party/skia"));
    let skia_out = env::var_os("CANVAS_SKIA_OUT").map(PathBuf::from).unwrap_or(skia_root.join("out/canvas2d-clang"));
    let object = out.join("skia_backend.obj");
    let library = out.join("skia_backend.lib");
    let script = out.join("build_skia_backend.cmd");
    fs::write(&script, format!(
        "@echo off\r\ncall \"{}\" >nul\r\nif errorlevel 1 exit /b %errorlevel%\r\n\"{}\" /nologo /std:c++20 /EHsc /MT /O2 /DNOMINMAX /DWIN32_LEAN_AND_MEAN /DSK_DAWN_HAS_D3D11 /I\"{}\" /I\"{}\" /I\"{}\" /I\"{}\" /c /Fo\"{}\" \"{}\"\r\nif errorlevel 1 exit /b %errorlevel%\r\n\"{}\" /lib /nologo /OUT:\"{}\" \"{}\"\r\n",
        vcvars.display(), clang_root.join("bin/clang-cl.exe").display(), skia_root.display(), out.display(),
        skia_root.join("third_party/externals/dawn/include").display(), skia_out.join("gen/third_party/dawn/include").display(),
        object.display(), root.join("src/skia_backend.cpp").display(), clang_root.join("bin/lld-link.exe").display(), library.display(), object.display()
    )).expect("write C++ build script");
    assert!(Command::new("cmd.exe").args(["/C", script.to_str().unwrap()]).status().expect("start C++ compiler").success(), "C++ compilation failed");
    println!("cargo:rustc-link-search=native={}", out.display());
    println!("cargo:rustc-link-search=native={}", skia_out.display());
    println!("cargo:rustc-link-lib=static=skia_backend");
    for lib in ["skshaper", "skunicode_bidi", "skunicode_core", "icu_bidi", "allocator_shim", "allocator_core", "allocator_base", "raw_ptr", "libjpeg", "libjpeg12", "libjpeg16", "libpng", "libwebp", "libwebp_sse41", "wuffs", "zlib", "skia"] {
        println!("cargo:rerun-if-changed={}", skia_out.join(format!("{lib}.lib")).display());
        println!("cargo:rustc-link-lib=static={lib}");
    }
    println!("cargo:rerun-if-changed={}", skia_out.join("dawn_combined.lib").display());
    println!("cargo:rustc-link-arg=/WHOLEARCHIVE:{}", skia_out.join("dawn_combined.lib").display());
    // Graphite/Dawn and software raster only. No ANGLE DLL import libraries.
    for lib in ["dwrite", "ole32", "uuid", "user32", "gdi32", "winmm", "windowscodecs", "usp10", "advapi32", "onecore", "delayimp", "dxguid", "d3d11", "dxgi"] {
        println!("cargo:rustc-link-lib={lib}");
    }
}

fn build_linux(root: &std::path::Path, out: &std::path::Path) {
    // Node-API is resolved with dlsym; all other symbols must resolve at link time.
    println!("cargo:rustc-link-arg=-Wl,-z,defs");
    // DT_RPATH applies to indirect dependencies too. Paths are relative to the addon,
    // so npm installations can move without LD_LIBRARY_PATH or install scripts.
    println!("cargo:rustc-link-arg=-Wl,--disable-new-dtags,-rpath,$ORIGIN/linux-libs");
    let skia = env::var_os("CANVAS_SKIA_ROOT").map(PathBuf::from).unwrap_or(root.join("third_party/skia"));
    let libs = env::var_os("CANVAS_SKIA_OUT").map(PathBuf::from).unwrap_or(skia.join("out/canvas-linux"));
    let object = out.join("skia_backend.o");
    let status = Command::new("clang++").args(["-std=c++20", "-O2", "-fPIC", "-DNDEBUG", "-DCANVAS_CPU_ONLY", "-DSK_R32_SHIFT=16", "-DSK_GAMMA_SRGB", "-DSK_GAMMA_CONTRAST=1.0"])
        .arg("-I").arg(&skia).arg("-I").arg(out)
        .arg("-I").arg(skia.join("third_party/externals/fontconfig"))
        .arg("-c").arg(root.join("src/skia_backend.cpp")).arg("-o").arg(&object)
        .status().expect("start clang++");
    assert!(status.success(), "Linux C++ compilation failed");
    assert!(Command::new("ar").arg("crs").arg(out.join("libskia_backend.a")).arg(object).status().unwrap().success());
    println!("cargo:rustc-link-search=native={}", out.display());
    println!("cargo:rustc-link-lib=static=skia_backend");
    // Group mutually dependent Skia/codec archives; no dynamic Skia installation needed.
    println!("cargo:rustc-link-arg=-Wl,--start-group");
    let mut archives: Vec<_> = fs::read_dir(&libs).expect("build Skia first").map(|e| e.unwrap().path())
        .filter(|p| p.extension().is_some_and(|e| e == "a")).collect();
    archives.sort();
    assert!(!archives.is_empty(), "No Skia static archives found");
    for archive in archives {
        println!("cargo:rerun-if-changed={}", archive.display());
        println!("cargo:rustc-link-arg={}", archive.display());
    }
    println!("cargo:rustc-link-arg=-Wl,--end-group");
    for lib in [":libfontconfig.so.1", "stdc++", "m", "dl", "pthread"] {
        println!("cargo:rustc-link-arg=-l{lib}");
    }
}
