#pragma once
#include <dlfcn.h>

// Retain system Fontconfig rules and installed fonts. A fontless container also
// works: the addon supplies a minimal configuration and licensed fallback fonts.
static sk_sp<SkFontMgr> canvas_linux_font_manager() {
    static sk_sp<SkFontMgr> manager = []() -> sk_sp<SkFontMgr> {
        FcConfig* config = FcConfigCreate();
        if (!config) return nullptr;
        if (!FcConfigParseAndLoad(config, nullptr, FcFalse)) {
            static const char fallback[] = R"xml(<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
  <dir>/usr/share/fonts</dir><dir>/usr/local/share/fonts</dir><dir prefix="xdg">fonts</dir>
  <cachedir prefix="xdg">fontconfig</cachedir>
  <alias><family>sans-serif</family><prefer><family>DejaVu Sans</family><family>Noto Sans CJK SC</family></prefer></alias>
  <alias><family>serif</family><prefer><family>DejaVu Serif</family></prefer></alias>
  <alias><family>monospace</family><prefer><family>DejaVu Sans Mono</family></prefer></alias>
</fontconfig>)xml";
            FcConfigParseAndLoadFromMemory(config, reinterpret_cast<const FcChar8*>(fallback), FcFalse);
        }
        FcConfigBuildFonts(config);
        Dl_info location{};
        if (dladdr(reinterpret_cast<const void*>(&canvas_linux_font_manager), &location) && location.dli_fname) {
            const std::string module(location.dli_fname);
            const auto slash = module.find_last_of('/');
            if (slash != std::string::npos) {
                const std::string directory = module.substr(0, slash) + "/fonts/";
                const char* fonts[][2] = {
                    {"DejaVu Sans", "DejaVuSans.ttf"}, {"DejaVu Serif", "DejaVuSerif.ttf"},
                    {"DejaVu Sans Mono", "DejaVuSansMono.ttf"},
                    {"Noto Sans CJK SC", "NotoSansCJKsc-Regular.otf"}
                };
                for (const auto& font : fonts) {
                    FcPattern* pattern = FcPatternCreate();
                    FcPatternAddString(pattern, FC_FAMILY, reinterpret_cast<const FcChar8*>(font[0]));
                    FcObjectSet* objects = FcObjectSetBuild(FC_FAMILY, nullptr);
                    FcFontSet* installed = FcFontList(config, pattern, objects);
                    const bool available = installed && installed->nfont > 0;
                    if (installed) FcFontSetDestroy(installed);
                    FcObjectSetDestroy(objects); FcPatternDestroy(pattern);
                    if (!available) {
                        const std::string file = directory + font[1];
                        FcConfigAppFontAddFile(config, reinterpret_cast<const FcChar8*>(file.c_str()));
                    }
                }
            }
        }
        return SkFontMgr_New_FontConfig(config, SkFontScanner_Make_FreeType());
    }();
    return manager;
}
