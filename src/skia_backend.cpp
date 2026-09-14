#include "include/core/SkCanvas.h"
#include "include/core/SkData.h"
#include "include/core/SkBlendMode.h"
#include "include/core/SkBlurTypes.h"
#include "include/core/SkColor.h"
#include "include/core/SkColorFilter.h"
#include "include/core/SkColorSpace.h"
#include "include/core/SkFont.h"
#include "include/core/SkFontArguments.h"
#include "include/core/SkFontMgr.h"
#include "include/core/SkFontMetrics.h"
#include "include/core/SkTextBlob.h"
#include "include/core/SkImageInfo.h"
#include "include/core/SkImage.h"
#include "include/core/SkMaskFilter.h"
#include "include/core/SkPaint.h"
#include "include/effects/SkDashPathEffect.h"
#include "include/core/SkPath.h"
#include "include/core/SkPathBuilder.h"
#include "include/core/SkPathUtils.h"
#include "include/core/SkPixmap.h"
#include "include/core/SkRRect.h"
#include "include/core/SkSurface.h"
#include "include/core/SkSamplingOptions.h"
#include "include/core/SkStrokeRec.h"
#include "include/gpu/ganesh/GrDirectContext.h"
#include "include/gpu/ganesh/GrContextOptions.h"
#include "include/gpu/ganesh/SkSurfaceGanesh.h"
#include "include/gpu/ganesh/gl/GrGLAssembleInterface.h"
#include "include/gpu/ganesh/gl/GrGLDirectContext.h"
#include "include/gpu/graphite/Context.h"
#include "include/gpu/graphite/ContextOptions.h"
#include "include/gpu/graphite/Image.h"
#include "include/gpu/graphite/Recorder.h"
#include "include/gpu/graphite/Recording.h"
#include "include/gpu/graphite/Surface.h"
#include "include/gpu/graphite/dawn/DawnBackendContext.h"
#include "include/ports/SkTypeface_win.h"
#include "include/utils/SkTextUtils.h"
#include "include/effects/SkGradient.h"
#include "modules/skshaper/include/SkShaper.h"
#include "modules/skshaper/include/SkShaper_harfbuzz.h"
#include "modules/skunicode/include/SkUnicode_bidi.h"

#define EGL_EGL_PROTOTYPES 1
#include <EGL/egl.h>
#include <EGL/eglext.h>
#include <EGL/eglext_angle.h>

#include "dawn/dawn_proc.h"
#include "dawn/native/DawnNative.h"
#include "webgpu/webgpu_cpp.h"

#include <algorithm>
#include <cmath>
#include <climits>
#include <cstdint>
#include <cstring>
#include <cstdlib>
#include <limits>
#include <memory>
#include <vector>

namespace {
#ifndef EGL_PLATFORM_ANGLE_ANGLE
#define EGL_PLATFORM_ANGLE_ANGLE 0x3202
#endif
#ifndef EGL_PLATFORM_ANGLE_TYPE_ANGLE
#define EGL_PLATFORM_ANGLE_TYPE_ANGLE 0x3203
#endif
#ifndef EGL_PLATFORM_ANGLE_TYPE_D3D11_ANGLE
#define EGL_PLATFORM_ANGLE_TYPE_D3D11_ANGLE 0x3208
#endif

static GrGLFuncPtr angle_gl_proc(void*, const char name[]) {
    return reinterpret_cast<GrGLFuncPtr>(eglGetProcAddress(name));
}

static int initialization_env_int(const char* name, int fallback) {
    const char* value = std::getenv(name);
    if (!value || !*value) return fallback;
    char* end = nullptr;
    const long parsed = std::strtol(value, &end, 10);
    return end != value ? static_cast<int>(parsed) : fallback;
}

struct AngleGaneshContext {
    EGLDisplay display = EGL_NO_DISPLAY;
    EGLSurface surface = EGL_NO_SURFACE;
    EGLContext context = EGL_NO_CONTEXT;
    sk_sp<GrDirectContext> ganesh;

    AngleGaneshContext() { this->initialize(); }

    ~AngleGaneshContext() {
        if (display == EGL_NO_DISPLAY) return;
        this->makeCurrent();
        ganesh.reset();
        eglMakeCurrent(display, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT);
        if (surface != EGL_NO_SURFACE) eglDestroySurface(display, surface);
        if (context != EGL_NO_CONTEXT) eglDestroyContext(display, context);
        eglTerminate(display);
    }

    bool makeCurrent() const {
        return display != EGL_NO_DISPLAY && surface != EGL_NO_SURFACE &&
               context != EGL_NO_CONTEXT &&
               eglMakeCurrent(display, surface, surface, context) == EGL_TRUE;
    }

    bool valid() const { return ganesh && this->makeCurrent(); }

private:
    void initialize() {
        auto get_platform_display = reinterpret_cast<PFNEGLGETPLATFORMDISPLAYEXTPROC>(
            eglGetProcAddress("eglGetPlatformDisplayEXT"));
        if (!get_platform_display) return;

        const EGLint display_attributes[] = {
            EGL_PLATFORM_ANGLE_TYPE_ANGLE,
            EGL_PLATFORM_ANGLE_TYPE_D3D11_ANGLE,
            EGL_NONE,
        };
        display = get_platform_display(EGL_PLATFORM_ANGLE_ANGLE,
                                       EGL_DEFAULT_DISPLAY,
                                       display_attributes);
        EGLint major = 0;
        EGLint minor = 0;
        if (display == EGL_NO_DISPLAY || eglInitialize(display, &major, &minor) != EGL_TRUE ||
            eglBindAPI(EGL_OPENGL_ES_API) != EGL_TRUE) {
            return;
        }

        const EGLint config_attributes[] = {
            EGL_SURFACE_TYPE, EGL_PBUFFER_BIT,
            EGL_RENDERABLE_TYPE, EGL_OPENGL_ES2_BIT,
            EGL_RED_SIZE, 8,
            EGL_GREEN_SIZE, 8,
            EGL_BLUE_SIZE, 8,
            EGL_ALPHA_SIZE, 8,
            EGL_NONE,
        };
        EGLConfig config = nullptr;
        EGLint config_count = 0;
        if (eglChooseConfig(display, config_attributes, &config, 1, &config_count) != EGL_TRUE ||
            config_count == 0) {
            return;
        }

        const EGLint context_attributes[] = {
            EGL_CONTEXT_CLIENT_VERSION, 3,
            EGL_CONTEXT_OPENGL_BACKWARDS_COMPATIBLE_ANGLE, EGL_FALSE,
            EGL_NONE,
        };
        context = eglCreateContext(display, config, EGL_NO_CONTEXT, context_attributes);
        if (context == EGL_NO_CONTEXT) return;

        const EGLint surface_attributes[] = {
            EGL_WIDTH, 1,
            EGL_HEIGHT, 1,
            EGL_NONE,
        };
        surface = eglCreatePbufferSurface(display, config, surface_attributes);
        if (surface == EGL_NO_SURFACE || !this->makeCurrent()) return;

        auto interface = GrGLMakeAssembledGLESInterface(nullptr, angle_gl_proc);
        if (!interface || !interface->validate()) return;
        GrContextOptions options;
        options.fDisableCoverageCountingPaths = initialization_env_int(
            "CANVAS_DISABLE_COVERAGE_COUNTING_PATHS", 1) != 0;
        options.fInternalMultisampleCount = initialization_env_int(
            "CANVAS_INTERNAL_MULTISAMPLE_COUNT", 8);
        const int reduce_ops_task_splitting = initialization_env_int(
            "CANVAS_REDUCE_OPS_TASK_SPLITTING", 0);
        options.fReduceOpsTaskSplitting = reduce_ops_task_splitting <= 0
            ? GrContextOptions::Enable::kNo
            : reduce_ops_task_splitting == 1
                ? GrContextOptions::Enable::kYes
                : GrContextOptions::Enable::kDefault;
        options.fPreferExternalImagesOverES3 = true;
        ganesh = GrDirectContexts::MakeGL(std::move(interface), options);
    }
};

static AngleGaneshContext& angle_ganesh_context() {
    // Node can unload native modules after dependent DLL teardown has started.
    // Keep the process-wide GPU context alive until the OS releases the process.
    static AngleGaneshContext* context = new AngleGaneshContext();
    return *context;
}

struct DawnGraphiteContext {
    std::unique_ptr<dawn::native::Instance> instance;
    wgpu::Adapter adapter;
    wgpu::Device device;
    wgpu::Queue queue;
    std::unique_ptr<skgpu::graphite::Context> graphite;

    DawnGraphiteContext() { this->initialize(); }

    bool valid() const { return instance && device && graphite; }

private:
    void initialize() {
        const DawnProcTable& procs = dawn::native::GetProcs();
        dawnProcSetProcs(&procs);

        static constexpr wgpu::InstanceFeatureName kInstanceFeatures[] = {
            wgpu::InstanceFeatureName::TimedWaitAny,
        };
        static constexpr const char* kInstanceToggles[] = {
            "allow_unsafe_apis",
        };
        wgpu::DawnTogglesDescriptor instance_toggles{};
        instance_toggles.enabledToggleCount = std::size(kInstanceToggles);
        instance_toggles.enabledToggles = kInstanceToggles;
        wgpu::InstanceDescriptor instance_descriptor{};
        instance_descriptor.requiredFeatureCount = std::size(kInstanceFeatures);
        instance_descriptor.requiredFeatures = kInstanceFeatures;
        instance_descriptor.nextInChain = &instance_toggles;
        instance = std::make_unique<dawn::native::Instance>(&instance_descriptor);

        static constexpr const char* kAdapterToggles[] = {
            "skip_validation",
            "disable_lazy_clear_for_mapped_at_creation_buffer",
            "disable_robustness",
            "enable_spirv_validation",
        };
        wgpu::DawnTogglesDescriptor adapter_toggles{};
        adapter_toggles.enabledToggleCount = std::size(kAdapterToggles);
        adapter_toggles.enabledToggles = kAdapterToggles;
        wgpu::RequestAdapterOptions adapter_options{};
        adapter_options.featureLevel = wgpu::FeatureLevel::Core;
        adapter_options.backendType = wgpu::BackendType::D3D11;
        adapter_options.nextInChain = &adapter_toggles;
        auto adapters = instance->EnumerateAdapters(&adapter_options);
        if (adapters.empty()) return;
        adapter = wgpu::Adapter(adapters.front().Get());

        std::vector<wgpu::FeatureName> features;
        const wgpu::FeatureName preferred_features[] = {
            wgpu::FeatureName::BufferMapExtendedUsages,
            wgpu::FeatureName::DawnAllowUndefinedLoadStoreOp,
            wgpu::FeatureName::DawnLoadResolveTexture,
            wgpu::FeatureName::DawnPartialLoadResolveTexture,
            wgpu::FeatureName::DawnTexelCopyBufferRowAlignment,
            wgpu::FeatureName::DualSourceBlending,
            wgpu::FeatureName::FramebufferFetch,
            wgpu::FeatureName::ImplicitDeviceSynchronization,
            wgpu::FeatureName::MSAARenderToSingleSampled,
            wgpu::FeatureName::ShaderF16,
            wgpu::FeatureName::TextureCompressionBC,
            wgpu::FeatureName::TextureCompressionETC2,
            wgpu::FeatureName::TextureFormatsTier1,
            wgpu::FeatureName::TimestampQuery,
            wgpu::FeatureName::TransientAttachments,
            wgpu::FeatureName::Unorm16TextureFormats,
            wgpu::FeatureName::RenderPassRenderArea,
        };
        for (const auto feature : preferred_features) {
            if (adapter.HasFeature(feature)) features.push_back(feature);
        }

        wgpu::Limits limits{};
        adapter.GetLimits(&limits);
        wgpu::DeviceDescriptor device_descriptor{};
        device_descriptor.requiredFeatureCount = features.size();
        device_descriptor.requiredFeatures = features.data();
        device_descriptor.requiredLimits = &limits;
        device_descriptor.nextInChain = &adapter_toggles;
        device = adapter.CreateDevice(&device_descriptor);
        if (!device) return;
        queue = device.GetQueue();

        skgpu::graphite::DawnBackendContext backend_context{};
        backend_context.fInstance = wgpu::Instance(instance->Get());
        backend_context.fDevice = device;
        backend_context.fQueue = queue;
        skgpu::graphite::ContextOptions context_options{};
        context_options.fInternalMultisampleCount = skgpu::graphite::SampleCount::k4;
        graphite = skgpu::graphite::ContextFactory::MakeDawn(backend_context, context_options);
    }
};

static DawnGraphiteContext& dawn_graphite_context() {
    static DawnGraphiteContext* context = new DawnGraphiteContext();
    return *context;
}

static float runtime_float(const char* name, float fallback) {
    const char* value = std::getenv(name);
    if (!value || !*value) return fallback;
    char* end = nullptr;
    const float parsed = std::strtof(value, &end);
    return end != value && std::isfinite(parsed) ? parsed : fallback;
}

static const char* runtime_string(const char* name, const char* fallback) {
    const char* value = std::getenv(name);
    return value && *value ? value : fallback;
}

static bool runtime_float_value(const char* name, float* result) {
    const char* value = std::getenv(name);
    if (!value || !*value) return false;
    char* end = nullptr;
    const float parsed = std::strtof(value, &end);
    if (end == value || !std::isfinite(parsed)) return false;
    *result = parsed;
    return true;
}

static float blink_font_size(float size, const char* override_name,
                             const char* fallback_override_name = nullptr) {
    const float clamped = std::max(0.f, size);
    float scale = 0;
    if (runtime_float_value(override_name, &scale) ||
        (fallback_override_name && runtime_float_value(fallback_override_name, &scale))) {
        return clamped * scale;
    }
    return std::floor(clamped * 100.f) / 100.f;
}

struct Gradient {
    int kind = 0;
    float args[6]{};
    std::vector<float> positions;
    std::vector<SkColor4f> colors;
};

struct Style {
    SkColor4f color = {0, 0, 0, 1};
    std::unique_ptr<Gradient> gradient;
    sk_sp<SkShader> pattern;
};

struct Canvas {
    std::unique_ptr<skgpu::graphite::Recorder> recorder;
    sk_sp<SkSurface> surface;
    bool graphite = false;
    bool opaque = false;
    bool image_smoothing = true;
    SkPathBuilder path;
    SkMatrix path_matrix = SkMatrix::I();
    bool simple_arc = false;
    SkRect arc_oval;
    float arc_start = 0, arc_sweep = 0;
    Style fill;
    Style stroke;
    SkColor4f shadow = {0, 0, 0, 0};
    float shadow_blur = 0;
    float shadow_offset_x = 0;
    float shadow_offset_y = 0;
    float line_width = 1;
    SkPaint::Cap line_cap = SkPaint::kButt_Cap;
    SkPaint::Join line_join = SkPaint::kMiter_Join;
    float miter_limit = 10;
    std::vector<SkScalar> line_dash;
    float line_dash_offset = 0;
    SkBlendMode blend_mode = SkBlendMode::kSrcOver;
    float global_alpha = 1;
};

static constexpr float kTwoPiFloat = SK_ScalarPI * 2.0f;

static void canonicalize_angle(float* start, float* end) {
    float new_start = std::fmod(*start, kTwoPiFloat);
    if (new_start < 0) {
        new_start += kTwoPiFloat;
        if (new_start >= kTwoPiFloat) new_start -= kTwoPiFloat;
    }
    const float delta = new_start - *start;
    *start = new_start;
    *end += delta;
}

static float clockwise_end_angle(float start, float end) {
    if (end - start >= kTwoPiFloat) return start + kTwoPiFloat;
    if (start > end) {
        return start + (kTwoPiFloat - std::fmod(start - end, kTwoPiFloat));
    }
    return end;
}

static float directed_end_angle(float start, float end, bool ccw) {
    if (!ccw) return clockwise_end_angle(start, end);
    if (start - end >= kTwoPiFloat) return start - kTwoPiFloat;
    if (end > start) return start - (kTwoPiFloat - std::fmod(end - start, kTwoPiFloat));
    return end;
}

// Retain paths in their last local coordinate space. Rebase only when the
// CTM changes; unchanged drawing sequences retain their original float math.
static bool prepare_path(Canvas* canvas) {
    if (!canvas || !canvas->surface) return false;
    const SkMatrix current = canvas->surface->getCanvas()->getTotalMatrix();
    SkMatrix inverse;
    if (!current.invert(&inverse)) return false;
    if (current != canvas->path_matrix) {
        canvas->simple_arc = false;
        if (!canvas->path.isEmpty()) {
            canvas->path.transform(SkMatrix::Concat(inverse, canvas->path_matrix));
        }
        canvas->path_matrix = current;
    }
    return true;
}

static bool mutate_path(Canvas* canvas) {
    if (!prepare_path(canvas)) return false;
    canvas->simple_arc = false;
    return true;
}

static float radians_to_degrees(float radians) {
    return radians * (180.0f / SK_ScalarPI);
}

static SkPaint make_paint(const Canvas* canvas, const Style& style, bool stroke) {
    SkPaint paint;
    paint.setAntiAlias(true);
    paint.setBlendMode(SkBlendMode::kSrcOver);
    paint.setStyle(stroke ? SkPaint::kStroke_Style : SkPaint::kFill_Style);
    paint.setStrokeWidth(canvas->line_width);
    paint.setStrokeCap(canvas->line_cap);
    paint.setStrokeJoin(canvas->line_join);
    paint.setStrokeMiter(canvas->miter_limit);
    if (stroke && !canvas->line_dash.empty()) {
        paint.setPathEffect(SkDashPathEffect::Make(
            SkSpan<const SkScalar>(canvas->line_dash.data(), canvas->line_dash.size()),
            canvas->line_dash_offset));
    }
    if (style.pattern) {
        paint.setShader(style.pattern);
        paint.setAlphaf(canvas->global_alpha);
    } else if (style.gradient) {
        const Gradient& g = *style.gradient;
        const SkColor4f transparent = SkColors::kTransparent;
        const float transparent_position = 0.0f;
        const SkSpan<const SkColor4f> colors = g.colors.empty()
            ? SkSpan<const SkColor4f>(&transparent, 1)
            : SkSpan<const SkColor4f>(g.colors.data(), g.colors.size());
        const SkSpan<const float> positions = g.positions.empty()
            ? SkSpan<const float>(&transparent_position, 1)
            : SkSpan<const float>(g.positions.data(), g.positions.size());
        SkGradient gradient(SkGradient::Colors(
            colors, positions, SkTileMode::kClamp), SkGradient::Interpolation{});
        sk_sp<SkShader> shader;
        if (g.kind == 1) {
            SkPoint points[2] = {{g.args[0], g.args[1]}, {g.args[2], g.args[3]}};
            shader = SkShaders::LinearGradient(points, gradient);
        } else if (g.kind == 2) {
            shader = SkShaders::TwoPointConicalGradient({g.args[0], g.args[1]}, g.args[4],
                                                         {g.args[2], g.args[3]}, g.args[5], gradient);
        } else if (g.kind == 3) {
            // A shifted sweep interval clamps the sector before startAngle.
            // Rotate a complete sweep instead so the color ramp wraps at its origin.
            SkMatrix rotation;
            rotation.setRotate(g.args[2] * 180.0f / SK_ScalarPI, g.args[0], g.args[1]);
            shader = SkShaders::SweepGradient({g.args[0], g.args[1]}, 0, 360, gradient,
                                               &rotation);
        }
        paint.setShader(std::move(shader));
        paint.setAlphaf(canvas->global_alpha);
        paint.setDither(true);
    } else {
        SkColor4f color = style.color;
        color.fA *= canvas->global_alpha;
        paint.setColor(SkColorSetARGB(
            static_cast<uint8_t>(std::round(color.fA * 255.0f)),
            static_cast<uint8_t>(std::round(color.fR * 255.0f)),
            static_cast<uint8_t>(std::round(color.fG * 255.0f)),
            static_cast<uint8_t>(std::round(color.fB * 255.0f))));
    }
    return paint;
}

static bool style_has_visible_alpha(const Style& style, float global_alpha);
static bool has_visible_shadow(const Canvas* canvas);

static SkPaint make_shadow_paint(const Canvas* canvas, const SkPaint& source) {
    SkPaint paint(source);
    if (canvas->shadow_blur > 0) {
        paint.setMaskFilter(SkMaskFilter::MakeBlur(
            kNormal_SkBlurStyle, canvas->shadow_blur * runtime_float("CANVAS_SHADOW_BLUR_SCALE", 0.5f), false));
    }
    paint.setColorFilter(SkColorFilters::Blend(
        canvas->shadow, SkColorSpace::MakeSRGB(), SkBlendMode::kSrcIn));
    return paint;
}

template <typename DrawProc>
static void draw_with_shadow(Canvas* canvas, const Style& style,
                             const SkPaint& source, DrawProc draw,
                             const SkPaint* shadow_source = nullptr) {
    SkCanvas* target = canvas->surface->getCanvas();
    if (canvas->blend_mode == SkBlendMode::kSrc) {
        target->drawColor(canvas->opaque ? SK_ColorBLACK : SK_ColorTRANSPARENT, SkBlendMode::kSrc);
        draw(target, source);
        return;
    }
    if (has_visible_shadow(canvas) && style_has_visible_alpha(style, canvas->global_alpha)) {
        SkAutoCanvasRestore restore(target, true);
        target->setMatrix(target->getLocalToDevice().postTranslate(
            canvas->shadow_offset_x, canvas->shadow_offset_y));
        draw(target, make_shadow_paint(canvas, shadow_source ? *shadow_source : source));
    }
    draw(target, source);
}

// Canvas shadows are generated from the alpha mask of the source draw.  A
// gradient with no color stops is transparent, so it cannot cast a shadow.
static bool style_has_visible_alpha(const Style& style, float global_alpha) {
    if (global_alpha <= 0) return false;
    if (style.pattern) return true;
    if (style.gradient) return true;
    return style.color.fA > 0;
}

// Blink's draw looper omits a shadow that is exactly coincident with the
// source. Drawing it independently doubles partially covered edge pixels.
static bool has_visible_shadow(const Canvas* canvas) {
    return canvas->shadow.fA > 0 &&
           (canvas->shadow_blur > 0 || canvas->shadow_offset_x != 0 || canvas->shadow_offset_y != 0);
}

static void draw_path(Canvas* canvas, bool stroke, bool evenodd = false) {
    if (!prepare_path(canvas)) return;
    SkPath path = canvas->path.snapshot();
    // An empty current path is a no-op even under copy composition.
    if (path.isEmpty()) return;
    if (!stroke && evenodd) path.setFillType(SkPathFillType::kEvenOdd);
    const Style& source_style = stroke ? canvas->stroke : canvas->fill;
    const SkPaint source = make_paint(canvas, source_style, stroke);
    draw_with_shadow(canvas, source_style, source,
                     [&](SkCanvas* draw_canvas, const SkPaint& paint) {
                         if (canvas->simple_arc) draw_canvas->drawArc(canvas->arc_oval, canvas->arc_start, canvas->arc_sweep, false, paint);
                         else draw_canvas->drawPath(path, paint);
                     });
}

static Style& selected_style(Canvas* canvas, int stroke) { return stroke ? canvas->stroke : canvas->fill; }

static SkFont resolve_font(const char* family, float size, int weight, int slant) {
    static sk_sp<SkFontMgr> font_manager = SkFontMgr_New_DirectWrite();
    const int clamped_weight = std::clamp(weight, 100, 900);
    const auto font_slant = slant == 2 ? SkFontStyle::kOblique_Slant
                                       : slant == 1 ? SkFontStyle::kItalic_Slant
                                                    : SkFontStyle::kUpright_Slant;
    const SkFontStyle style(clamped_weight, SkFontStyle::kNormal_Width, font_slant);
    const char* font_file = runtime_string("CANVAS_FONT_FILE", "");
    sk_sp<SkTypeface> typeface = font_manager && font_file[0]
        ? font_manager->makeFromFile(font_file) : nullptr;
    if(!typeface && font_manager && family){
        // Match each CSS family in order. A nonexistent family must not
        // prevent a later installed family from being selected.
        std::string name;char quote=0;
        auto match_family=[&](){
            const auto first=name.find_first_not_of(" \t\r\n");
            const auto last=name.find_last_not_of(" \t\r\n");
            if(first!=std::string::npos){
                const std::string candidate=name.substr(first,last-first+1);
                auto styles=font_manager->matchFamily(candidate.c_str());
                if(styles && styles->count()>0)typeface=styles->matchStyle(style);
            }
            name.clear();
        };
        for(const char* p=family;;++p){
            const char ch=*p;
            if(!ch){match_family();break;}
            if(quote){if(ch==quote)quote=0;else name+=ch;}
            else if(ch=='\''||ch=='"')quote=ch;
            else if(ch==','){match_family();if(typeface)break;}
            else name+=ch;
        }
    }
    // Blink's Windows generic sans-serif selection resolves to the platform
    // sans-serif fallback. Noto Sans SC is installed with this runtime and
    // matches that DirectWrite fallback for both Latin and CJK text.
    if (!typeface && font_manager) {
        typeface = font_manager->matchFamilyStyle(runtime_string("CANVAS_FONT_FALLBACK", "Noto Sans SC"), style);
    }
    if (!typeface && font_manager) typeface = font_manager->matchFamilyStyle("Arial", style);
    const float variation_weight = runtime_float("CANVAS_FONT_VARIATION_WEIGHT", 0.0f);
    if (typeface && variation_weight > 0.0f) {
        const SkFontArguments::VariationPosition::Coordinate coordinate = {
            SkFontArguments::VariationPosition::Coordinate::wght, variation_weight};
        SkFontArguments arguments;
        arguments.setVariationDesignPosition({&coordinate, 1});
        if (auto clone = typeface->makeClone(arguments)) typeface = std::move(clone);
    }
    // Blink's Canvas shaping stage passes linearly measured, subpixel glyph
    // runs into Skia. The public DirectWrite font manager otherwise rounds
    // advances differently, so retain these run-level settings here.
    SkFont font(typeface, blink_font_size(size, "CANVAS_GLYPH_SCALE"));
    const int hinting = static_cast<int>(runtime_float("CANVAS_FONT_HINTING", 1.0f));
    font.setHinting(hinting <= 0 ? SkFontHinting::kNone
                    : hinting == 2 ? SkFontHinting::kFull
                    : hinting == 3 ? SkFontHinting::kSlight
                                   : SkFontHinting::kNormal);
    const int edging = static_cast<int>(runtime_float("CANVAS_FONT_EDGING", 1.0f));
    font.setEdging(edging <= 0 ? SkFont::Edging::kAlias
                              : edging == 2 ? SkFont::Edging::kSubpixelAntiAlias
                                            : SkFont::Edging::kAntiAlias);
    font.setSubpixel(runtime_float("CANVAS_FONT_SUBPIXEL", 1.0f) != 0.0f);
    font.setLinearMetrics(runtime_float("CANVAS_FONT_LINEAR_METRICS", 0.0f) != 0.0f);
    font.setBaselineSnap(runtime_float("CANVAS_FONT_BASELINE_SNAP", 0.0f) != 0.0f);
    font.setEmbeddedBitmaps(runtime_float("CANVAS_FONT_EMBEDDED_BITMAPS", 1.0f) != 0.0f);
    font.setForceAutoHinting(runtime_float("CANVAS_FONT_AUTO_HINT", 0.0f) != 0.0f);
    return font;
}

// Build a positioned glyph run explicitly. This follows the Canvas text path
// more closely than MakeFromText: UTF-8 is converted once, advances are
// generated by the resolved font, and the resulting glyph positions are kept
// as floating point values through rasterization.
static sk_sp<SkTextBlob> make_positioned_text_blob(const char* text, size_t length,
                                                   const SkFont& font,
                                                   const SkFont& position_font) {
    if (!text || length == 0) return nullptr;
    const size_t glyph_count = font.textToGlyphs(text, length, SkTextEncoding::kUTF8, {});
    if (glyph_count == 0) return nullptr;
    std::vector<SkGlyphID> glyphs(glyph_count);
    if (font.textToGlyphs(text, length, SkTextEncoding::kUTF8,
                          SkSpan<SkGlyphID>(glyphs.data(), glyphs.size())) != glyph_count) {
        return nullptr;
    }
    std::vector<SkPoint> positions(glyph_count);
    position_font.getPos(SkSpan<const SkGlyphID>(glyphs.data(), glyphs.size()),
                         SkSpan<SkPoint>(positions.data(), positions.size()));
    return SkTextBlob::MakeFromPosGlyphs(
        SkSpan<const SkGlyphID>(glyphs.data(), glyphs.size()),
        SkSpan<const SkPoint>(positions.data(), positions.size()), font);
}

class PositionedRunHandler final : public SkShaper::RunHandler {
public:
    explicit PositionedRunHandler(const SkFont& draw_font) : draw_font_(draw_font) {}

    void beginLine() override { position_ = {0, 0}; }
    void runInfo(const RunInfo&) override {}
    void commitRunInfo() override {}
    Buffer runBuffer(const RunInfo& info) override {
        const int count = static_cast<int>(std::min<size_t>(info.glyphCount, INT_MAX));
        const size_t offset = glyphs_.size();
        glyphs_.resize(offset + count);
        positions_.resize(offset + count);
        return {glyphs_.data() + offset, positions_.data() + offset,
                nullptr, nullptr, position_};
    }
    void commitRunBuffer(const RunInfo& info) override { position_ += info.fAdvance; }
    void commitLine() override {}

    float advance() const { return position_.fX; }
    const std::vector<SkGlyphID>& glyphs() const { return glyphs_; }
    const std::vector<SkPoint>& positions() const { return positions_; }
    sk_sp<SkTextBlob> makeBlob() {
        if (glyphs_.empty()) return nullptr;
        SkTextBlobBuilder builder;
        const auto& buffer = builder.allocRunPos(draw_font_, static_cast<int>(glyphs_.size()));
        std::memcpy(buffer.glyphs, glyphs_.data(), sizeof(SkGlyphID) * glyphs_.size());
        std::memcpy(buffer.points(), positions_.data(), sizeof(SkPoint) * positions_.size());
        return builder.make();
    }

private:
    SkFont draw_font_;
    SkPoint position_ = {0, 0};
    std::vector<SkGlyphID> glyphs_;
    std::vector<SkPoint> positions_;
};

static sk_sp<SkTextBlob> shape_text_blob(const char* text, size_t length,
                                        const SkFont& draw_font,
                                        const SkFont& position_font,
                                        bool enable_kern,
                                        float* advance = nullptr,
                                        std::vector<SkGlyphID>* glyphs = nullptr,
                                        std::vector<SkPoint>* positions = nullptr) {
    auto unicode = SkUnicodes::Bidi::Make();
    auto shaper = SkShapers::HB::ShapeDontWrapOrReorder(std::move(unicode), nullptr);
    auto script = SkShapers::HB::ScriptRunIterator(text, length);
    if (!shaper || !script) return nullptr;

    SkShaper::TrivialFontRunIterator font(position_font, length);
    SkShaper::TrivialBiDiRunIterator bidi(SkBidiIterator::kLTR, length);
    SkShaper::TrivialLanguageRunIterator language("und", length);
    PositionedRunHandler handler(draw_font);
    const SkShaper::Feature kern = {
        SkSetFourByteTag('k', 'e', 'r', 'n'), 0, 0, length
    };
    shaper->shape(text, length, font, bidi, *script, language,
                  enable_kern ? nullptr : &kern, enable_kern ? 0 : 1,
                  std::numeric_limits<SkScalar>::max(), &handler);
    if (advance) *advance = handler.advance();
    if (glyphs) *glyphs = handler.glyphs();
    if (positions) *positions = handler.positions();
    return handler.makeBlob();
}

static sk_sp<SkTextBlob> make_shaped_text_blob(const char* text, size_t length,
                                               const SkFont& draw_font,
                                               const SkFont& position_font,
                                               float* advance = nullptr) {
    const bool enable_kern = runtime_float("CANVAS_HARFBUZZ_KERN", 1.0f) != 0.0f;
    float shaped_advance = 0;
    std::vector<SkGlyphID> shaped_glyphs;
    std::vector<SkPoint> shaped_positions;
    auto shaped = shape_text_blob(text, length, draw_font, position_font,
                                  enable_kern, &shaped_advance,
                                  &shaped_glyphs, &shaped_positions);
    if (!shaped || !enable_kern) {
        if (advance) *advance = shaped_advance;
        return shaped;
    }

    float unkerned_advance = 0;
    std::vector<SkGlyphID> unkerned_glyphs;
    std::vector<SkPoint> unkerned_positions;
    auto unkerned = shape_text_blob(text, length, draw_font, position_font,
                                    false, &unkerned_advance,
                                    &unkerned_glyphs, &unkerned_positions);
    const size_t direct_count = position_font.textToGlyphs(
        text, length, SkTextEncoding::kUTF8, {});
    std::vector<SkGlyphID> direct_glyphs(direct_count);
    std::vector<SkPoint> direct_positions(direct_count);
    const bool direct_ok = direct_count > 0 && position_font.textToGlyphs(
        text, length, SkTextEncoding::kUTF8,
        SkSpan<SkGlyphID>(direct_glyphs.data(), direct_glyphs.size())) == direct_count;
    if (!unkerned || !direct_ok || shaped_positions.size() != shaped_glyphs.size() ||
        unkerned_positions.size() != unkerned_glyphs.size() ||
        shaped_glyphs != unkerned_glyphs || shaped_glyphs.size() != direct_glyphs.size() ||
        std::any_of(unkerned_positions.begin(), unkerned_positions.end(),
                    [](const SkPoint& point) { return point.fY != 0; })) {
        if (advance) *advance = shaped_advance;
        return shaped;
    }

    position_font.getPos(SkSpan<const SkGlyphID>(direct_glyphs.data(), direct_glyphs.size()),
                         SkSpan<SkPoint>(direct_positions.data(), direct_positions.size()));
    SkTextBlobBuilder builder;
    const auto& buffer = builder.allocRunPos(draw_font, static_cast<int>(direct_count));
    for (size_t index = 0; index < direct_count; ++index) {
        buffer.glyphs[index] = direct_glyphs[index];
        buffer.points()[index] = direct_positions[index] +
            (shaped_positions[index] - unkerned_positions[index]);
    }
    if (advance) {
        *advance = position_font.measureText(text, length, SkTextEncoding::kUTF8) +
            shaped_advance - unkerned_advance;
    }
    return builder.make();
}
}

extern "C" {
void* skia_canvas_create(uint32_t width, uint32_t height, int alpha) {
    if (width == 0 || height == 0) return nullptr;
    auto canvas = std::make_unique<Canvas>();
    canvas->opaque = alpha == 0;
    // Canvas backing stores are 8-bit premultiplied-alpha images.  getImageData
    // converts that backing store to unpremultiplied RGBA for JavaScript.
    const uint32_t surface_flags = runtime_float("CANVAS_DEVICE_INDEPENDENT_FONTS", 0.0f) != 0.0f
        ? SkSurfaceProps::kUseDeviceIndependentFonts_Flag : SkSurfaceProps::kDefault_Flag;
    const int pixel_geometry = std::clamp(
        static_cast<int>(runtime_float("CANVAS_PIXEL_GEOMETRY", 0.0f)), 0, 4);
    // Chromium's Windows Skia build uses SK_GAMMA_SRGB and full text contrast.
    const SkSurfaceProps surface_props(surface_flags, static_cast<SkPixelGeometry>(pixel_geometry),
                                       runtime_float("CANVAS_TEXT_CONTRAST", 1.0f),
                                       runtime_float("CANVAS_TEXT_GAMMA", 0.0f));
    const SkColorType color_type = runtime_float("CANVAS_GPU_RGBA", 0.0f) != 0.0f
        ? kRGBA_8888_SkColorType : kBGRA_8888_SkColorType;
    const GrSurfaceOrigin surface_origin = runtime_float("CANVAS_GPU_BOTTOM_LEFT", 0.0f) != 0.0f
        ? kBottomLeft_GrSurfaceOrigin : kTopLeft_GrSurfaceOrigin;
    const SkImageInfo image_info = SkImageInfo::Make(
        width, height, color_type, canvas->opaque ? kOpaque_SkAlphaType : kPremul_SkAlphaType, SkColorSpace::MakeSRGB());
    if (runtime_float("CANVAS_RASTER_SURFACE", 0.0f) != 0.0f) {
        canvas->surface = SkSurfaces::Raster(image_info, &surface_props);
    } else if (runtime_float("CANVAS_USE_GANESH", 0.0f) == 0.0f) {
        auto& gpu = dawn_graphite_context();
        if (!gpu.valid()) return nullptr;
        canvas->recorder = gpu.graphite->makeRecorder();
        if (!canvas->recorder) return nullptr;
        canvas->surface = SkSurfaces::RenderTarget(
            canvas->recorder.get(), image_info, skgpu::Mipmapped::kNo, &surface_props);
        canvas->graphite = true;
    } else {
        auto& gpu = angle_ganesh_context();
        if (!gpu.valid()) return nullptr;
        canvas->surface = SkSurfaces::RenderTarget(
            gpu.ganesh.get(), skgpu::Budgeted::kNo, image_info,
            0, surface_origin, &surface_props);
    }
    if (!canvas->surface) return nullptr;
    // A protected root frame lets reset remove even clips made before save().
    canvas->surface->getCanvas()->clear(canvas->opaque ? SK_ColorBLACK : SK_ColorTRANSPARENT);
    canvas->surface->getCanvas()->save();
    return canvas.release();
}

void skia_canvas_destroy(void* value) {
    auto* canvas = static_cast<Canvas*>(value);
    if (!canvas) return;
    if (!canvas->graphite) angle_ganesh_context().makeCurrent();
    delete canvas;
}
void skia_canvas_scale(void* value, float x, float y) { if (auto* c = static_cast<Canvas*>(value)) c->surface->getCanvas()->scale(x, y); }
void skia_canvas_translate(void* value, float x, float y) { if (auto* c = static_cast<Canvas*>(value)) c->surface->getCanvas()->translate(x, y); }
void skia_canvas_rotate(void* value, float radians) { if (auto* c = static_cast<Canvas*>(value)) c->surface->getCanvas()->rotate(radians * 180.0f / SK_ScalarPI); }
void skia_canvas_save(void* value) { if (auto* c = static_cast<Canvas*>(value)) c->surface->getCanvas()->save(); }
void skia_canvas_restore(void* value) { if (auto* c = static_cast<Canvas*>(value); c && c->surface->getCanvas()->getSaveCount() > 2) c->surface->getCanvas()->restore(); }
void skia_canvas_set_transform(void* value, float a, float b, float cc, float d, float e, float f) {
    auto* c = static_cast<Canvas*>(value); if (!c) return;
    SkMatrix matrix; matrix.setAll(a, cc, e, b, d, f, 0, 0, 1); c->surface->getCanvas()->setMatrix(matrix);
}
void skia_canvas_transform(void* value, float a, float b, float cc, float d, float e, float f) {
    auto* c = static_cast<Canvas*>(value); if (!c) return;
    SkMatrix matrix; matrix.setAll(a, cc, e, b, d, f, 0, 0, 1); c->surface->getCanvas()->concat(matrix);
}

void skia_canvas_begin_path(void* value) { if (auto* c = static_cast<Canvas*>(value)) { c->path.reset(); c->simple_arc=false; c->path_matrix = c->surface->getCanvas()->getTotalMatrix(); } }
void skia_canvas_move_to(void* value, float x, float y) { if (auto* c = static_cast<Canvas*>(value); mutate_path(c)) c->path.moveTo(x, y); }
void skia_canvas_line_to(void* value, float x, float y) { if (auto* c = static_cast<Canvas*>(value); mutate_path(c)) c->path.lineTo(x, y); }
void skia_canvas_quad_to(void* value, float x1, float y1, float x2, float y2) { if (auto* c = static_cast<Canvas*>(value); mutate_path(c)) c->path.quadTo(x1, y1, x2, y2); }
void skia_canvas_cubic_to(void* value, float x1, float y1, float x2, float y2, float x3, float y3) { if (auto* c = static_cast<Canvas*>(value); mutate_path(c)) c->path.cubicTo(x1, y1, x2, y2, x3, y3); }
void skia_canvas_close_path(void* value) { if (auto* c = static_cast<Canvas*>(value)) { c->path.close(); c->simple_arc=false; } }
void skia_canvas_rect(void* value, float x, float y, float width, float height) { if (auto* c = static_cast<Canvas*>(value); mutate_path(c)) c->path.addRect(SkRect::MakeXYWH(x, y, width, height)); }
void skia_canvas_round_rect(void* value, float x, float y, float width, float height, const float* radii) {
    if (auto* c = static_cast<Canvas*>(value); mutate_path(c) && radii) {
        const SkRect rect = SkRect::MakeLTRB(std::min(x, x + width), std::min(y, y + height),
                                             std::max(x, x + width), std::max(y, y + height));
        const SkVector corners[4] = {
            {radii[0], radii[1]}, {radii[2], radii[3]},
            {radii[4], radii[5]}, {radii[6], radii[7]}
        };
        c->path.addRRect(SkRRect::MakeRectRadii(rect, corners));
    }
}
void skia_canvas_arc_to(void* value, float x1, float y1, float x2, float y2, float radius) {
    if (auto* c = static_cast<Canvas*>(value); mutate_path(c)) c->path.arcTo({x1, y1}, {x2, y2}, std::max(0.f, radius));
}
void skia_canvas_arc(void* value, float x, float y, float radius, float start, float end, int ccw) {
    if (auto* c = static_cast<Canvas*>(value); mutate_path(c)) {
        canonicalize_angle(&start, &end);
        end = directed_end_angle(start, end, ccw != 0);
        const SkRect oval = SkRect::MakeLTRB(x-radius, y-radius, x+radius, y+radius);
        const float degrees = radians_to_degrees(start), sweep = radians_to_degrees(end-start);
        if (c->path.isEmpty()) {
            c->path.addArc(oval, degrees, sweep);
            c->simple_arc=true;c->arc_oval=oval;c->arc_start=degrees;c->arc_sweep=sweep;
            return;
        }
        if (SkScalarNearlyEqual(std::abs(sweep), 360.0f)) {
            const float half = std::copysign(180.0f, sweep);
            c->path.arcTo(oval, degrees, half, false);
            c->path.arcTo(oval, degrees+half, half, false);
        } else { c->path.arcTo(oval, degrees, sweep, false); }
    }
}
void skia_canvas_ellipse(void* value, float cx, float cy, float rx, float ry, float rotation, float start, float end, int ccw) {
    auto* c = static_cast<Canvas*>(value); if (!mutate_path(c)) return;
    canonicalize_angle(&start, &end);
    end = directed_end_angle(start, end, ccw != 0);

    SkMatrix forward = SkMatrix::I();
    if (rotation != 0) {
        // Blink's AffineTransform stores doubles, then clamps each coefficient
        // to float when converting to SkMatrix.
        const double cosine = std::cos(static_cast<double>(rotation));
        const double sine = std::sin(static_cast<double>(rotation));
        const double determinant = cosine * cosine + sine * sine;
        SkMatrix inverse;
        inverse.setAll(static_cast<float>(cosine / determinant),
                       static_cast<float>(sine / determinant),
                       static_cast<float>((-sine * cy - cosine * cx) / determinant),
                       static_cast<float>(-sine / determinant),
                       static_cast<float>(cosine / determinant),
                       static_cast<float>((sine * cx - cosine * cy) / determinant),
                       0, 0, 1);
        c->path.transform(inverse);
        forward.setAll(static_cast<float>(cosine), static_cast<float>(-sine), cx,
                       static_cast<float>(sine), static_cast<float>(cosine), cy,
                       0, 0, 1);
    }

    const SkRect oval = rotation == 0
        ? SkRect::MakeLTRB(cx - rx, cy - ry, cx + rx, cy + ry)
        : SkRect::MakeLTRB(-rx, -ry, rx, ry);
    const float start_degrees = radians_to_degrees(start);
    const float sweep_degrees = radians_to_degrees(end - start);
    if (SkScalarNearlyEqual(std::abs(sweep_degrees), 360.0f)) {
        const float sweep180 = std::copysign(180.0f, sweep_degrees);
        c->path.arcTo(oval, start_degrees, sweep180, false);
        c->path.arcTo(oval, start_degrees + sweep180, sweep180, false);
    } else {
        c->path.arcTo(oval, start_degrees, sweep_degrees, false);
    }
    if (rotation != 0) c->path.transform(forward);
}
void skia_canvas_fill(void* value, int evenodd) { draw_path(static_cast<Canvas*>(value), false, evenodd != 0); }
void skia_canvas_stroke(void* value) { draw_path(static_cast<Canvas*>(value), true); }
void skia_canvas_fill_rect(void* value, float x, float y, float width, float height) {
    auto* c = static_cast<Canvas*>(value); if (!c) return;
    SkRect rect = SkRect::MakeXYWH(x, y, width, height);
    SkCanvas* target = c->surface->getCanvas();
    const SkPaint source = make_paint(c, c->fill, false);
    draw_with_shadow(c, c->fill, source,
                     [&](SkCanvas* draw_canvas, const SkPaint& paint) {
                         draw_canvas->drawRect(rect, paint);
                     });
}
void skia_canvas_clear_rect(void* value, float x, float y, float width, float height) {
    auto* c = static_cast<Canvas*>(value); if (!c) return;
    SkPaint clear;
    clear.setBlendMode(c->opaque ? SkBlendMode::kSrc : SkBlendMode::kClear);
    clear.setColor(SK_ColorBLACK);
    c->surface->getCanvas()->drawRect(SkRect::MakeXYWH(x, y, width, height), clear);
}
void skia_canvas_stroke_rect(void* value, float x, float y, float width, float height) {
    auto* c = static_cast<Canvas*>(value); if (!c) return;
    SkRect rect = SkRect::MakeXYWH(x, y, width, height);
    SkCanvas* target = c->surface->getCanvas();
    const SkPaint source = make_paint(c, c->stroke, true);
    draw_with_shadow(c, c->stroke, source,
                     [&](SkCanvas* draw_canvas, const SkPaint& paint) {
                         draw_canvas->drawRect(rect, paint);
                     });
}
void skia_canvas_clip(void* value, int evenodd) {
    auto* c = static_cast<Canvas*>(value);
    if (!prepare_path(c)) return;
    SkPath path = c->path.snapshot();
    if (evenodd) path.setFillType(SkPathFillType::kEvenOdd);
    c->surface->getCanvas()->clipPath(path, SkClipOp::kIntersect, true);
}
int skia_canvas_point_in_path(void* value, float x, float y, int stroke, int evenodd) {
    auto* c = static_cast<Canvas*>(value); if (!prepare_path(c)) return 0;
    SkPoint point = {x, y};
    SkMatrix inverse;
    if (!c->path_matrix.invert(&inverse)) return 0;
    inverse.mapPoints(SkSpan<SkPoint>(&point, 1));
    SkPath path = c->path.snapshot();
    if (!stroke && evenodd) path.setFillType(SkPathFillType::kEvenOdd);
    if (!stroke) return path.contains(point);
    SkPathBuilder outline;
    // Include path effects (notably dashes) as well as stroke width/caps/joins.
    if (!skpathutils::FillPathWithPaint(path, make_paint(c, c->stroke, true), &outline)) return 0;
    return outline.snapshot().contains(point);
}

void skia_canvas_set_color(void* value, int stroke, uint8_t r, uint8_t g, uint8_t b, uint8_t a) {
    auto* c = static_cast<Canvas*>(value); if (!c) return;
    Style& style = selected_style(c, stroke); style.gradient.reset(); style.pattern.reset(); style.color = {r / 255.f, g / 255.f, b / 255.f, a / 255.f};
}
void skia_canvas_set_gradient(void* value, int stroke, int kind, const float* args, const float* positions, const uint8_t* colors, uint32_t count) {
    auto* c = static_cast<Canvas*>(value); if (!c) return;
    auto gradient = std::make_unique<Gradient>(); gradient->kind = kind;
    if (args) std::memcpy(gradient->args, args, sizeof(gradient->args));
    for (uint32_t i = 0; i < count; ++i) {
        gradient->positions.push_back(positions[i]);
        gradient->colors.push_back({colors[i * 4] / 255.f, colors[i * 4 + 1] / 255.f,
                                    colors[i * 4 + 2] / 255.f, colors[i * 4 + 3] / 255.f});
    }
    selected_style(c, stroke).pattern.reset();
    selected_style(c, stroke).gradient = std::move(gradient);
}
void skia_canvas_set_pattern(void* value, int stroke, const uint8_t* pixels, uint32_t width, uint32_t height, int repeat_x, int repeat_y) {
    auto* c = static_cast<Canvas*>(value); if (!c || !pixels || width == 0 || height == 0) return;
    const size_t bytes = static_cast<size_t>(width) * height * 4;
    auto data = SkData::MakeWithCopy(pixels, bytes);
    auto image = SkImages::RasterFromData(SkImageInfo::Make(width, height, kRGBA_8888_SkColorType, kUnpremul_SkAlphaType), std::move(data), width * 4);
    if (!image) return;
    const SkTileMode tx = repeat_x ? SkTileMode::kRepeat : SkTileMode::kDecal;
    const SkTileMode ty = repeat_y ? SkTileMode::kRepeat : SkTileMode::kDecal;
    selected_style(c, stroke).gradient.reset();
    selected_style(c, stroke).pattern = image->makeShader(tx, ty, SkSamplingOptions());
}
void skia_canvas_set_shadow(void* value, uint8_t r, uint8_t g, uint8_t b, uint8_t a, float blur, float offset_x, float offset_y) {
    auto* c = static_cast<Canvas*>(value); if (!c) return; c->shadow = {r / 255.f, g / 255.f, b / 255.f, a / 255.f}; c->shadow_blur = std::max(0.f, blur); c->shadow_offset_x = offset_x; c->shadow_offset_y = offset_y;
}
void skia_canvas_set_line_width(void* value, float width) { if (auto* c = static_cast<Canvas*>(value)) c->line_width = std::max(0.f, width); }
void skia_canvas_set_stroke_style(void* value, int cap, int join, float miter_limit) {
    auto* c = static_cast<Canvas*>(value); if (!c) return;
    c->line_cap = cap == 1 ? SkPaint::kRound_Cap : cap == 2 ? SkPaint::kSquare_Cap : SkPaint::kButt_Cap;
    c->line_join = join == 1 ? SkPaint::kRound_Join : join == 2 ? SkPaint::kBevel_Join : SkPaint::kMiter_Join;
    c->miter_limit = std::max(0.f, miter_limit);
}
void skia_canvas_set_line_dash(void* value, const float* values, uint32_t count, float offset) {
    auto* c = static_cast<Canvas*>(value); if (!c) return;
    c->line_dash.clear();
    if (values && count) c->line_dash.assign(values, values + count);
    c->line_dash_offset = offset;
}
void skia_canvas_set_global_alpha(void* value, float alpha) { if (auto* c = static_cast<Canvas*>(value)) c->global_alpha = std::clamp(alpha, 0.f, 1.f); }
void skia_canvas_set_composite(void* value, int copy) { if (auto* c = static_cast<Canvas*>(value)) c->blend_mode = copy ? SkBlendMode::kSrc : SkBlendMode::kSrcOver; }
void skia_canvas_set_image_smoothing(void* value, int enabled) { if (auto* c = static_cast<Canvas*>(value)) c->image_smoothing = enabled != 0; }
void skia_canvas_draw_text(void* value, const char* text, uint32_t length,
                           const char* family, float x, float y, float size, int stroke,
                           int weight, int slant) {
    auto* c = static_cast<Canvas*>(value); if (!c || !text) return;
    SkCanvas* target = c->surface->getCanvas();
    // The raster Skia build has DirectWrite enabled. A null typeface has no
    // glyphs in this configuration, so resolve Canvas' sans-serif fallback
    // through the platform font manager before shaping/drawing text.
    SkFont font = resolve_font(family, size, weight, slant);
    const Style& source_style = stroke ? c->stroke : c->fill;
    auto text_paint = [&]() {
        SkPaint paint = make_paint(c, source_style, stroke);
        // Kept local to text while evaluating Blink's glyph-outline stroke
        // behaviour; path strokes continue to use the Canvas line width.
        if (stroke) paint.setStrokeWidth(c->line_width * runtime_float("CANVAS_TEXT_STROKE", 1.0f));
        return paint;
    };
    const SkPaint source = text_paint();
    SkPaint shadow_source(source);
    SkFont foreground_base_font(font);
    const float foreground_variation_weight = runtime_float(
        "CANVAS_TEXT_FOREGROUND_VARIATION_WEIGHT", 0.0f);
    if (foreground_variation_weight > 0.0f) {
        const SkFontArguments::VariationPosition::Coordinate coordinate = {
            SkFontArguments::VariationPosition::Coordinate::wght,
            foreground_variation_weight};
        SkFontArguments arguments;
        arguments.setVariationDesignPosition({&coordinate, 1});
        if (auto clone = foreground_base_font.refTypeface()->makeClone(arguments)) {
            foreground_base_font.setTypeface(std::move(clone));
        }
    }
    SkFont foreground_font(foreground_base_font);
    foreground_font.setSize(blink_font_size(size,
        "CANVAS_TEXT_FOREGROUND_GLYPH_SCALE", "CANVAS_GLYPH_SCALE"));
    foreground_font.setScaleX(runtime_float("CANVAS_TEXT_FOREGROUND_SCALE_X", 1.0f));
    foreground_font.setSkewX(runtime_float("CANVAS_TEXT_FOREGROUND_SKEW_X", 0.0f));
    const int foreground_edging = static_cast<int>(runtime_float("CANVAS_TEXT_FOREGROUND_EDGING", 2.0f));
    foreground_font.setEdging(foreground_edging <= 0 ? SkFont::Edging::kAlias
                               : foreground_edging == 2 ? SkFont::Edging::kSubpixelAntiAlias
                                                       : SkFont::Edging::kAntiAlias);
    SkFont shadow_font(font);
    shadow_font.setSize(blink_font_size(size,
        "CANVAS_TEXT_SHADOW_GLYPH_SCALE", "CANVAS_GLYPH_SCALE"));
    const float shadow_scale_x = runtime_float(
        stroke ? "CANVAS_TEXT_SHADOW_STROKE_SCALE_X" : "CANVAS_TEXT_SHADOW_FILL_SCALE_X",
        runtime_float("CANVAS_TEXT_SHADOW_SCALE_X", 1.0f));
    shadow_font.setScaleX(shadow_scale_x);
    const int shadow_edging = static_cast<int>(runtime_float("CANVAS_TEXT_SHADOW_EDGING", 2.0f));
    shadow_font.setEdging(shadow_edging <= 0 ? SkFont::Edging::kAlias
                           : shadow_edging == 2 ? SkFont::Edging::kSubpixelAntiAlias
                                               : SkFont::Edging::kAntiAlias);
    if (stroke) {
        shadow_source.setStrokeWidth(c->line_width * runtime_float(
            "CANVAS_TEXT_SHADOW_STROKE", 1.0f));
    }
    draw_with_shadow(c, source_style, source,
                     [&](SkCanvas* draw_canvas, const SkPaint& paint) {
                         const bool shadow_pass = paint.getColorFilter() != nullptr;
                         const float text_x = x + (stroke ? runtime_float("CANVAS_STROKE_TEXT_X_OFFSET", 0.0f) : 0.0f)
                                                + (shadow_pass ? runtime_float("CANVAS_TEXT_SHADOW_X_OFFSET", 0.0f) : 0.0f);
                         const float text_y = y - (stroke ? runtime_float("CANVAS_TEXT_BASELINE", 0.0f) : 0.0f)
                                                 + (stroke ? runtime_float("CANVAS_STROKE_TEXT_Y_OFFSET", 0.0f) : 0.0f)
                                                 + (shadow_pass ? runtime_float("CANVAS_TEXT_SHADOW_Y_OFFSET", 0.0f) : 0.0f);
                         const bool explicit_glyphs = runtime_float("CANVAS_EXPLICIT_GLYPHS", 1.0f) != 0.0f;
                         const bool harfbuzz_shaping = runtime_float("CANVAS_HARFBUZZ_SHAPING", 1.0f) != 0.0f;
                         const SkFont& draw_font = shadow_pass ? shadow_font : foreground_font;
                         if (explicit_glyphs) {
                             SkFont position_font(shadow_pass ? font : foreground_base_font);
                             position_font.setSize(blink_font_size(size,
                                 shadow_pass ? "CANVAS_TEXT_SHADOW_POSITION_SCALE"
                                             : "CANVAS_TEXT_FOREGROUND_POSITION_SCALE",
                                 "CANVAS_GLYPH_SCALE"));
                             auto blob = harfbuzz_shaping
                                 ? make_shaped_text_blob(text, length, draw_font, position_font)
                                 : make_positioned_text_blob(text, length, draw_font, position_font);
                             if (blob) draw_canvas->drawTextBlob(blob, text_x, text_y, paint);
                         } else {
                             SkTextUtils::Draw(draw_canvas, text, length, SkTextEncoding::kUTF8,
                                               text_x, text_y, draw_font,
                                               paint, SkTextUtils::kLeft_Align);
                         }
                     }, &shadow_source);
}
static float canvas_shaped_metrics(const char* text, uint32_t length, const SkFont& font,
                                  std::vector<SkGlyphID>& glyphs, std::vector<SkPoint>& positions) {
    float advance=0;
    shape_text_blob(text,length,font,font,true,&advance,&glyphs,&positions);
    std::vector<SkScalar> widths(glyphs.size());
    font.getWidths(SkSpan<const SkGlyphID>(glyphs.data(),glyphs.size()),SkSpan<SkScalar>(widths.data(),widths.size()));
    // SkShaper rounds advances to HB 16.16; Blink truncates the font metrics.
    // Adjust each glyph advance before accumulating, retaining shaping/kerning.
    float correction=0;
    for(size_t i=0;i<widths.size();i++){
        positions[i].fX+=correction;
        const float fixed=widths[i]*65536.0f;
        correction+=(std::trunc(fixed)-std::floor(fixed+0.5f))/65536.0f;
    }
    return advance+correction;
}
float skia_canvas_measure_text(void* value, const char* text, uint32_t length,
                               const char* family, float size, int weight, int slant) {
    if (!value || !text) return 0;
    SkFont font = resolve_font(family, size, weight, slant);
    if (runtime_float("CANVAS_HARFBUZZ_SHAPING", 1.0f) != 0.0f) {
        std::vector<SkGlyphID> glyphs;std::vector<SkPoint> positions;
        const float advance=canvas_shaped_metrics(text,length,font,glyphs,positions);
        if (!glyphs.empty()) return advance;
    }
    return font.measureText(text, length, SkTextEncoding::kUTF8);
}
void skia_canvas_text_bounds(void* value, const char* text, uint32_t length,
                               const char* family, float size, int weight, int slant, float* output) {
    if (!value || !text || !output) return;
    SkFont font=resolve_font(family,size,weight,slant);
    std::vector<SkGlyphID> glyphs;
    std::vector<SkPoint> positions;
    canvas_shaped_metrics(text,length,font,glyphs,positions);
    std::vector<SkRect> bounds(glyphs.size());
    // Blink obtains glyph ink bounds using its LCD text edging configuration.
    font.setEdging(SkFont::Edging::kSubpixelAntiAlias);
    font.getBounds(SkSpan<const SkGlyphID>(glyphs.data(),glyphs.size()),SkSpan<SkRect>(bounds.data(),bounds.size()),nullptr);
    SkRect combined=SkRect::MakeEmpty();
    for(size_t i=0;i<bounds.size();i++) {bounds[i].offset(positions[i]);combined.join(bounds[i]);}
    output[0]=combined.left();output[1]=combined.top();output[2]=combined.right();output[3]=combined.bottom();
}
void skia_canvas_font_metrics(void* value, const char* family, float size,
                              int weight, int slant, float* ascent, float* descent) {
    if (!value || !ascent || !descent) return;
    SkFontMetrics metrics;
    resolve_font(family, size, weight, slant).getMetrics(&metrics);
    *ascent = metrics.fAscent;
    *descent = metrics.fDescent;
}
void skia_canvas_typo_metrics(void* value, const char* family, float size,
                              int weight, int slant, float* ascent, float* descent) {
    if (!value || !ascent || !descent) return;
    SkFont font = resolve_font(family, size, weight, slant);
    SkFontMetrics metrics;
    font.getMetrics(&metrics);
    float a = -metrics.fAscent, d = metrics.fDescent;
    uint8_t table[4];
    if (font.getTypeface()->getTableData(SkSetFourByteTag('O','S','/','2'),
                                        68, sizeof(table), table) == sizeof(table)) {
        const float ta = static_cast<int16_t>((table[0] << 8) | table[1]);
        const float td = -static_cast<int16_t>((table[2] << 8) | table[3]);
        if (ta > 0 && td >= 0) { a = ta; d = td; }
    }
    // Blink SimpleFontData normalizes OS/2 typo metrics to one em, then
    // rounds to LayoutUnit (1/64 px). Descent is the remaining em height.
    *ascent = *descent = 0;
    if (a + d > 0 && a >= 0 && d >= 0) {
        *ascent = std::round((a * size / (a + d)) * 64.0f) / 64.0f;
        *descent = std::round(size * 64.0f) / 64.0f - *ascent;
    }
}
void skia_canvas_reset(void* value) {
    auto* c = static_cast<Canvas*>(value); if (!c || !c->surface) return;
    SkCanvas* target = c->surface->getCanvas();
    target->restoreToCount(1);
    target->resetMatrix();
    target->clear(c->opaque ? SK_ColorBLACK : SK_ColorTRANSPARENT);
    target->save();
    c->path.reset();
    c->path_matrix = SkMatrix::I();
    c->simple_arc = false;
}
void skia_canvas_clear_bitmap(void* value) {
    auto* c=static_cast<Canvas*>(value); if (!c || !c->surface) return;
    // writePixels ignores the current clip and CTM and preserves the state stack.
    const int width=c->surface->width(), height=c->surface->height();
    std::vector<uint8_t> zeros(static_cast<size_t>(width)*height*4, 0);
    if (c->opaque) for (size_t i=3;i<zeros.size();i+=4) zeros[i]=255;
    c->surface->writePixels(SkPixmap(SkImageInfo::MakeN32Premul(width,height),zeros.data(),static_cast<size_t>(width)*4),0,0);
}
void skia_canvas_draw_rgba_image(void* value, const uint8_t* input, uint32_t image_width, uint32_t image_height,
                                 float sx, float sy, float sw, float sh, float dx, float dy, float dw, float dh) {
    auto* c = static_cast<Canvas*>(value);
    if (!c || !c->surface || !input || image_width == 0 || image_height == 0 || sw == 0 || sh == 0 || dw == 0 || dh == 0) return;
    if (sw < 0) { sx += sw; sw = -sw; }
    if (sh < 0) { sy += sh; sh = -sh; }
    if (dw < 0) { dx += dw; dw = -dw; }
    if (dh < 0) { dy += dh; dh = -dh; }
    // An entirely out-of-bounds source is rejected before copy clears the clip.
    if (!std::isfinite(sx) || !std::isfinite(sy) || !std::isfinite(sw) || !std::isfinite(sh) ||
        !std::isfinite(dx) || !std::isfinite(dy) || !std::isfinite(dw) || !std::isfinite(dh) ||
        sx >= image_width || sy >= image_height || sx + sw <= 0 || sy + sh <= 0) return;
    const size_t bytes = static_cast<size_t>(image_width) * image_height * 4;
    auto pixels = SkData::MakeWithCopy(input, bytes);
    auto image = SkImages::RasterFromData(SkImageInfo::Make(image_width, image_height, kRGBA_8888_SkColorType,
                                                             kUnpremul_SkAlphaType), std::move(pixels), image_width * 4);
    if (!image) return;
    if (c->graphite) {
        image = SkImages::TextureFromImage(c->recorder.get(), image);
        if (!image) return;
    }
    SkPaint paint;
    paint.setAntiAlias(true);
    // Blink quantizes the image paint alpha to a byte before GPU composition.
    paint.setAlpha(static_cast<U8CPU>(std::round(c->global_alpha * 255.0f)));
    paint.setBlendMode(SkBlendMode::kSrcOver);
    Style image_style;
    image_style.color={1,1,1,1};
    draw_with_shadow(c,image_style,paint,[&](SkCanvas* target,const SkPaint& image_paint){
    target->drawImageRect(image.get(), SkRect::MakeXYWH(sx, sy, sw, sh),
                                           SkRect::MakeXYWH(dx, dy, dw, dh),
                                           SkSamplingOptions(c->image_smoothing ? SkFilterMode::kLinear : SkFilterMode::kNearest), &image_paint,
                                           SkCanvas::kFast_SrcRectConstraint);
    });
}
void skia_canvas_read(void* value, int32_t x, int32_t y, uint32_t width, uint32_t height, uint8_t* output) {
    auto* c = static_cast<Canvas*>(value); if (!output) return;
    std::memset(output, 0, static_cast<size_t>(width) * height * 4);
    if (!c || !c->surface || width == 0 || height == 0) return;
    const int32_t left = std::max<int32_t>(0, x);
    const int32_t top = std::max<int32_t>(0, y);
    const int32_t right = std::min<int32_t>(static_cast<int32_t>(c->surface->width()), x + static_cast<int32_t>(width));
    const int32_t bottom = std::min<int32_t>(static_cast<int32_t>(c->surface->height()), y + static_cast<int32_t>(height));
    if (right <= left || bottom <= top) return;
    const uint32_t copy_width = static_cast<uint32_t>(right - left);
    const uint32_t copy_height = static_cast<uint32_t>(bottom - top);
    const size_t destination_offset = (static_cast<size_t>(top - y) * width + static_cast<uint32_t>(left - x)) * 4;
    if (c->graphite) {
        auto& gpu = dawn_graphite_context();
        if (!gpu.valid() || !c->recorder) return;
        auto recording = c->recorder->snap();
        if (!recording) return;
        skgpu::graphite::InsertRecordingInfo recording_info{};
        recording_info.fRecording = recording.get();
        if (gpu.graphite->insertRecording(recording_info) !=
            skgpu::graphite::InsertStatus::kSuccess) {
            return;
        }

        struct ReadbackContext {
            uint8_t* destination;
            size_t destination_row_bytes;
            size_t copy_row_bytes;
            uint32_t height;
            bool success = false;
        } readback{
            output + destination_offset,
            static_cast<size_t>(width) * 4,
            static_cast<size_t>(copy_width) * 4,
            copy_height,
        };
        gpu.graphite->asyncRescaleAndReadPixels(
            c->surface.get(),
            SkImageInfo::Make(copy_width, copy_height, kRGBA_8888_SkColorType,
                              kUnpremul_SkAlphaType),
            SkIRect::MakeXYWH(left, top, copy_width, copy_height),
            SkImage::RescaleGamma::kSrc,
            SkImage::RescaleMode::kNearest,
            [](SkImage::ReadPixelsContext context,
               std::unique_ptr<const SkImage::AsyncReadResult> result) {
                auto* state = static_cast<ReadbackContext*>(context);
                if (!result || result->count() != 1) return;
                const auto* source = static_cast<const uint8_t*>(result->data(0));
                for (uint32_t row = 0; row < state->height; ++row) {
                    std::memcpy(state->destination + row * state->destination_row_bytes,
                                source + row * result->rowBytes(0),
                                state->copy_row_bytes);
                }
                state->success = true;
            },
            &readback);
        gpu.graphite->submit(skgpu::graphite::SyncToCpu::kYes);
        return;
    }

    if (!angle_ganesh_context().makeCurrent()) return;
    skgpu::ganesh::FlushAndSubmit(c->surface.get());
    if (runtime_float("CANVAS_READBACK_RP", 0.0f) == 0.0f) {
        c->surface->readPixels(SkImageInfo::Make(copy_width, copy_height, kRGBA_8888_SkColorType, kUnpremul_SkAlphaType),
                               output + destination_offset, static_cast<size_t>(width) * 4, left, top);
        return;
    }

    std::vector<uint8_t> premul(static_cast<size_t>(copy_width) * copy_height * 4);
    if (!c->surface->readPixels(
            SkImageInfo::Make(copy_width, copy_height, kRGBA_8888_SkColorType, kPremul_SkAlphaType),
            premul.data(), static_cast<size_t>(copy_width) * 4, left, top)) {
        return;
    }
    auto unpremul_raster_pipeline = [](uint8_t channel, uint8_t alpha) -> uint8_t {
        if (alpha == 0) return 0;
        if (alpha == 255) return channel;
        const float normalization = 1.0f / 255.0f;
        const float normalized_alpha = static_cast<float>(alpha) * normalization;
        const float reciprocal_alpha = 1.0f / normalized_alpha;
        const float normalized_channel = static_cast<float>(channel) * normalization;
        const float answer = std::min(255.0f, normalized_channel * reciprocal_alpha * 255.0f);
        const uint32_t lower = static_cast<uint32_t>(std::floor(answer));
        const float fraction = answer - static_cast<float>(lower);
        uint32_t rounded = lower;
        if (fraction > 0.5f || (fraction == 0.5f && (lower & 1))) {
            ++rounded;
        }
        return static_cast<uint8_t>(std::min<uint32_t>(rounded, 255));
    };
    for (uint32_t row = 0; row < copy_height; ++row) {
        uint8_t* destination = output + destination_offset + static_cast<size_t>(row) * width * 4;
        const uint8_t* source = premul.data() + static_cast<size_t>(row) * copy_width * 4;
        for (uint32_t column = 0; column < copy_width; ++column) {
            const uint8_t alpha = source[3];
            destination[0] = unpremul_raster_pipeline(source[0], alpha);
            destination[1] = unpremul_raster_pipeline(source[1], alpha);
            destination[2] = unpremul_raster_pipeline(source[2], alpha);
            destination[3] = alpha;
            source += 4;
            destination += 4;
        }
    }
}
void skia_canvas_write(void* value, const uint8_t* input, uint32_t source_width, uint32_t source_height,
                       int32_t x, int32_t y) {
    auto* c = static_cast<Canvas*>(value); if (!c || !c->surface || !input || source_width == 0 || source_height == 0) return;
    const int32_t left = std::max<int32_t>(0, x);
    const int32_t top = std::max<int32_t>(0, y);
    const int32_t right = std::min<int32_t>(static_cast<int32_t>(c->surface->width()), x + static_cast<int32_t>(source_width));
    const int32_t bottom = std::min<int32_t>(static_cast<int32_t>(c->surface->height()), y + static_cast<int32_t>(source_height));
    if (right <= left || bottom <= top) return;
    const uint32_t copy_width = static_cast<uint32_t>(right - left);
    const uint32_t copy_height = static_cast<uint32_t>(bottom - top);
    const size_t source_offset = (static_cast<size_t>(top - y) * source_width + static_cast<uint32_t>(left - x)) * 4;
    SkPixmap source(SkImageInfo::Make(copy_width, copy_height, kRGBA_8888_SkColorType, kUnpremul_SkAlphaType),
                    input + source_offset, static_cast<size_t>(source_width) * 4);
    c->surface->writePixels(source, left, top);
}
}
