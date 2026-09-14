use std::env;
use std::path::PathBuf;
use std::process::Command;

fn main() {
    let root = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let out = PathBuf::from(env::var("OUT_DIR").unwrap());
    let source = root.join("src/skia_backend.cpp");
    let object = out.join("skia_backend.obj");
    let library = out.join("skia_backend.lib");
    let vcvars = r#"C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Auxiliary\Build\vcvars64.bat"#;
    let clang = root.join("third_party/chrome153-clang/bin/clang-cl.exe");
    let lld_link = root.join("third_party/chrome153-clang/bin/lld-link.exe");
    let include = root.join("third_party/skia");
    let angle_include = root.join("third_party/skia/third_party/externals/angle2/include");
    let dawn_include = root.join("third_party/skia/third_party/externals/dawn/include");
    let dawn_generated_include =
        root.join("third_party/skia/out/canvas2d-clang/gen/third_party/dawn/include");
    let skia_out = root.join("third_party/skia/out/canvas2d-clang");

    println!("cargo:rerun-if-changed={}", source.display());
    println!("cargo:rerun-if-changed={}", skia_out.join("skia.lib").display());
    println!("cargo:rerun-if-changed={}", skia_out.join("skshaper.lib").display());
    println!("cargo:rerun-if-changed={}", skia_out.join("dawn_combined.lib").display());

    let script = out.join("build_skia_backend.cmd");
    std::fs::write(&script, format!(
        "@echo off\r\ncall \"{vcvars}\" >nul\r\n\"{}\" /nologo /std:c++20 /EHsc /MT /O2 /DNOMINMAX /DWIN32_LEAN_AND_MEAN /DSK_DAWN_HAS_D3D11 /I\"{}\" /I\"{}\" /I\"{}\" /I\"{}\" /c /Fo\"{}\" \"{}\"\r\nif errorlevel 1 exit /b %errorlevel%\r\n\"{}\" /lib /nologo /OUT:\"{}\" \"{}\"\r\n",
        clang.display(), include.display(), angle_include.display(), dawn_include.display(),
        dawn_generated_include.display(), object.display(), source.display(),
        lld_link.display(), library.display(), object.display()
    )).expect("write MSVC build script");
    let status = Command::new("cmd.exe").args(["/C", script.to_str().unwrap()]).status().expect("start MSVC");
    assert!(status.success(), "MSVC could not compile src/skia_backend.cpp");

    println!("cargo:rustc-link-search=native={}", out.display());
    println!("cargo:rustc-link-search=native={}", skia_out.display());
    println!("cargo:rustc-link-lib=static=skia_backend");
    for library in [
        "skshaper", "skunicode_bidi", "skunicode_core", "icu_bidi",
        "allocator_shim", "allocator_core", "allocator_base", "raw_ptr",
    ] {
        println!("cargo:rustc-link-lib=static={library}");
    }
    println!("cargo:rustc-link-lib=static=skia");
    println!("cargo:rustc-link-arg=/WHOLEARCHIVE:{}", skia_out.join("dawn_combined.lib").display());
    for library in ["libEGL.dll.lib", "libGLESv2.dll.lib"] {
        println!("cargo:rustc-link-arg={}", skia_out.join(library).display());
    }
    for library in ["dwrite", "ole32", "uuid", "user32", "gdi32", "opengl32", "winmm", "windowscodecs", "usp10", "advapi32", "onecore", "delayimp", "dxguid", "d3d11", "dxgi"] {
        println!("cargo:rustc-link-lib={library}");
    }
}
