#pragma once
#include <map>
#include <set>
#include <sstream>

namespace {
static std::string json_string(const std::string& value) {
    std::string out = "\"";
    for (unsigned char c : value) {
        if (c == '"' || c == '\\') { out += '\\'; out += c; }
        else if (c < 32) { char escaped[7]; std::snprintf(escaped, sizeof(escaped), "\\u%04x", c); out += escaped; }
        else out += c;
    }
    return out + '"';
}
static bool diagnostics_enabled() {
    const char* flag = std::getenv("CANVAS_DIAGNOSTICS");
    return flag && std::strcmp(flag, "1") == 0;
}
static std::map<std::string, std::string> observed_fonts;
static std::set<SkTypefaceID> observed_typefaces;
static uint64_t graphite_surfaces = 0, raster_surfaces = 0;
static std::string selected_adapter = "null";

static std::string font_version(SkTypeface* face) {
    auto data = face->copyTableData(SkSetFourByteTag('n','a','m','e'));
    if (!data || data->size() < 6) return "";
    const auto* bytes = static_cast<const uint8_t*>(data->data());
    auto u16 = [&](size_t i) { return static_cast<unsigned>(bytes[i]) * 256 + bytes[i + 1]; };
    const unsigned count = u16(2), base = u16(4);
    for (unsigned i = 0; i < count; ++i) {
        const size_t p = 6 + i * 12;
        if (p + 12 > data->size()) break;
        if (u16(p + 6) != 5 || (u16(p) != 0 && u16(p) != 3)) continue;
        const size_t length = u16(p + 8), offset = base + u16(p + 10);
        if (offset + length > data->size() || length % 2) continue;
        std::wstring wide;
        for (size_t j = 0; j < length; j += 2) wide += static_cast<wchar_t>(u16(offset + j));
        const int size = WideCharToMultiByte(CP_UTF8, 0, wide.data(), static_cast<int>(wide.size()), nullptr, 0, nullptr, nullptr);
        std::string result(size, '\0');
        WideCharToMultiByte(CP_UTF8, 0, wide.data(), static_cast<int>(wide.size()), result.data(), size, nullptr, nullptr);
        return result;
    }
    return "";
}
static void record_font(SkTypeface* face) {
    if (!diagnostics_enabled() || !face || !observed_typefaces.insert(face->uniqueID()).second) return;
    SkString family, postscript;
    face->getFamilyName(&family);
    face->getPostScriptName(&postscript);
    const auto style = face->fontStyle();
    const auto key = std::string(family.c_str()) + ":" + postscript.c_str() + ":" + std::to_string(style.weight()) + ":" + std::to_string(style.slant());
    observed_fonts[key] = "{\"family\":" + json_string(family.c_str()) + ",\"postScriptName\":" + json_string(postscript.c_str()) +
        ",\"version\":" + json_string(font_version(face)) + ",\"weight\":" + std::to_string(style.weight()) +
        ",\"width\":" + std::to_string(style.width()) + ",\"slant\":" + std::to_string(style.slant()) + "}";
}
// Called while holding the shared rendering mutex.
static std::string render_diagnostics_json() {
    std::string out = "{\"tracingEnabled\":" + std::string(diagnostics_enabled() ? "true" : "false") +
        ",\"defaultBackend\":" + json_string(canvas_default_raster ? "raster" : "graphite-dawn-d3d11") +
        ",\"graphiteSurfaces\":" + std::to_string(graphite_surfaces) + ",\"rasterSurfaces\":" + std::to_string(raster_surfaces) +
        ",\"selectedAdapter\":" + selected_adapter + ",\"usedFonts\":[";
    bool first = true;
    for (const auto& item : observed_fonts) { if (!first) out += ','; first = false; out += item.second; }
    out += "],\"availableFontFamilies\":[";
    auto manager = SkFontMgr_New_DirectWrite();
    if (manager) for (int i = 0; i < manager->countFamilies(); ++i) {
        SkString family; manager->getFamilyName(i, &family);
        if (i) out += ',';
        out += json_string(family.c_str());
    }
    return out + "]}";
}
}
