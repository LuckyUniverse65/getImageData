#include <mutex>
#include "include/core/SkCanvas.h"
#include "include/core/SkGraphics.h"
#include "include/core/SkTiledImageUtils.h"
#include "include/private/chromium/Slug.h"
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
#include "include/effects/SkImageFilters.h"
#include "include/core/SkPath.h"
#include "include/core/SkPathBuilder.h"
#include "include/core/SkPathUtils.h"
#include "include/core/SkPixmap.h"
#include "include/core/SkRRect.h"
#include "include/core/SkSurface.h"
#include "include/core/SkSamplingOptions.h"
#include "include/core/SkShader.h"
#include "include/core/SkStrokeRec.h"
#include "include/gpu/ganesh/GrDirectContext.h"
#include "include/gpu/ganesh/GrContextOptions.h"
#include "include/gpu/ganesh/SkSurfaceGanesh.h"
#include "include/gpu/ganesh/gl/GrGLAssembleInterface.h"
#include "include/gpu/ganesh/gl/GrGLDirectContext.h"
#include "include/gpu/graphite/Context.h"
#include "include/gpu/graphite/ContextOptions.h"
#include "include/gpu/graphite/Image.h"
#include "include/gpu/graphite/ImageProvider.h"
#include "include/gpu/graphite/Recorder.h"
#include "include/gpu/graphite/Recording.h"
#include "include/gpu/graphite/Surface.h"
#include "include/gpu/graphite/dawn/DawnBackendContext.h"
#include "include/ports/SkTypeface_win.h"
#include "include/codec/SkCodec.h"
#include "include/codec/SkJpegDecoder.h"
#include "include/codec/SkPngDecoder.h"
#include "include/codec/SkWebpDecoder.h"
#include "include/encode/SkJpegEncoder.h"
#include "include/encode/SkPngEncoder.h"
#include "include/encode/SkWebpEncoder.h"
#include "include/utils/SkParsePath.h"
#include "include/utils/SkTextUtils.h"
#include "include/effects/SkGradient.h"
#include "modules/skshaper/include/SkShaper.h"
#include "modules/skshaper/include/SkShaper_harfbuzz.h"
#include "modules/skshaper/include/SkShaper_skunicode.h"
#include "modules/skunicode/include/SkUnicode_bidi.h"
#include "src/core/SkUTF.h"
#include "src/core/SkPathPriv.h"
#include "third_party/externals/harfbuzz/src/hb.h"
#include "third_party/externals/harfbuzz/src/hb-ot.h"
#include <Windows.h>

extern "C" uint32_t canvas_uppercase(uint32_t codepoint, uint32_t* output);
extern "C" uint32_t canvas_lowercase(uint32_t codepoint, uint32_t* output);

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
            "use_packed_depth24_unorm_stencil8_format",
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

// IEEE binary16 conversion with round-to-nearest, ties-to-even. The bundled
// baseline Skia CPU path truncates half stores on machines without F16C.
static uint16_t canvas_half(float value) {
    uint32_t bits;std::memcpy(&bits,&value,sizeof(bits));
    const uint16_t sign=(bits>>16)&0x8000;
    const uint32_t exponent=(bits>>23)&255, mantissa=bits&0x7fffff;
    if(exponent==255)return sign|0x7c00|(mantissa?0x0200:0);
    const int e=static_cast<int>(exponent)-112;
    if(e>=31)return sign|0x7c00;
    if(e<=0) {
        if(e<-10)return sign;
        const uint32_t m=mantissa|0x800000,shift=14-e;
        const uint32_t halfway=1u<<(shift-1);
        return sign|static_cast<uint16_t>((m+halfway-1+((m>>shift)&1))>>shift);
    }
    return sign|static_cast<uint16_t>((e<<10)+((mantissa+0xfff+((mantissa>>13)&1))>>13));
}
static bool canvas_convert_pixels(const SkPixmap& source,const SkImageInfo& info,void* destination,size_t row_bytes) {
    if(info.colorType()!=kRGBA_F16_SkColorType)return source.readPixels(info,destination,row_bytes);
    std::vector<float> pixels(static_cast<size_t>(info.width())*info.height()*4);
    if(!source.readPixels(info.makeColorType(kRGBA_F32_SkColorType),pixels.data(),static_cast<size_t>(info.width())*16))return false;
    for(int y=0;y<info.height();++y) {
        auto* row=reinterpret_cast<uint16_t*>(static_cast<uint8_t*>(destination)+y*row_bytes);
        for(int x=0;x<info.width()*4;++x)row[x]=canvas_half(pixels[static_cast<size_t>(y)*info.width()*4+x]);
    }
    return true;
}

static sk_sp<SkColorSpace> canvas_color_space(int p3) {
    return p3 ? SkColorSpace::MakeRGB(SkNamedTransferFn::kSRGB, SkNamedGamut::kDisplayP3) : SkColorSpace::MakeSRGB();
}
static bool full_canvas_composite(SkBlendMode mode) {
    return mode==SkBlendMode::kSrcIn || mode==SkBlendMode::kSrcOut || mode==SkBlendMode::kDstIn || mode==SkBlendMode::kDstATop;
}

struct Gradient {
    int kind = 0;
    float args[6]{};
    std::vector<float> positions;
    std::vector<SkColor4f> colors;
};

struct Style {
    bool float_color = false;
    SkColor4f color = {0, 0, 0, 1};
    std::unique_ptr<Gradient> gradient;
    sk_sp<SkShader> pattern;
};

struct TextOptions {
    float letter=0, word=0;
    bool kern=true, rtl=false;
    int slant=0;
    int stretch=5,caps=0,rendering=0;
    bool space_word_ltr=true, space_word_rtl=true;
};
struct SpaceShapeEntry {
    std::string family;
    float size,letter,word;
    int weight,slant,small_caps,stretch,caps,rendering;
    bool kern;
    bool known[2]={false,false}, apply_word[2]={true,true};
};
struct TextCache { std::vector<SpaceShapeEntry> spaces; };
// SkCanvas splits oversized raster images into texture-sized tiles. Graphite
// asks the client to upload each tile; its default provider drops these draws.
class CanvasImageProvider final : public skgpu::graphite::ImageProvider {
public:
    sk_sp<SkImage> findOrCreate(skgpu::graphite::Recorder* recorder,
                               const SkImage* image, SkImage::RequiredProperties props) override {
        return SkImages::TextureFromImage(recorder,image,props);
    }
};
struct Canvas {
    TextOptions text_options;
    TextCache* text_cache=nullptr; // Owned by the context, independent of its surface.
    std::unique_ptr<skgpu::graphite::Recorder> recorder;
    sk_sp<SkSurface> surface;
    bool graphite = false;
    bool raster = false;
    bool opaque = false;
    bool image_smoothing = true;
    int image_quality=0;
    SkPathBuilder path;
    SkMatrix path_matrix = SkMatrix::I();
    bool simple_arc = false;
    bool closed_arc = false;
    // 1: initial move, 2: a single line, 0: general path.
    int line_builder_state = 0;
    bool line_path_cached = false;
    SkRect arc_oval;
    float arc_start = 0, arc_sweep = 0;
    Style fill;
    Style stroke;
    sk_sp<SkImageFilter> filter;  // ctx.filter, already parsed from CSS
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

// PlainTextNode caches each space after ApplySpacing(item.StartOffset()).
// Its shape key contains text/direction, but not the original offset. Retain
// that observable first-use result per Canvas/font configuration. NBSP is not
// a word delimiter and always receives word spacing, including at offset zero.
static TextOptions text_layout_options(Canvas* c,const char* text,size_t length,
        const char* family,float size,int weight,int slant,int small_caps) {
    auto options=c->text_options;
    if(!options.word || !c->text_cache || !std::memchr(text,' ',length))return options;
    auto& space_shapes=c->text_cache->spaces;
    auto found=std::find_if(space_shapes.begin(),space_shapes.end(),[&](const auto& e){
        return e.family==(family?family:"") && e.size==size && e.weight==weight &&
            e.slant==slant && e.small_caps==small_caps && e.letter==options.letter &&
            e.word==options.word && e.kern==options.kern && e.stretch==options.stretch &&
            e.caps==options.caps && e.rendering==options.rendering;
    });
    if(found==space_shapes.end()) {
        // Bound retained compatibility state; no font or JS object references.
        if(space_shapes.size()>=256)space_shapes.erase(space_shapes.begin());
        space_shapes.push_back({family?family:"",size,options.letter,options.word,
                                  weight,slant,small_caps,options.stretch,options.caps,options.rendering,options.kern});
        found=space_shapes.end()-1;
    }
    auto unicode=SkUnicodes::Bidi::Make();
    std::vector<SkUnicode::BidiRegion> regions;
    unicode->getBidiRegions(text,static_cast<int>(length),
        options.rtl?SkUnicode::TextDirection::kRTL:SkUnicode::TextDirection::kLTR,&regions);
    std::vector<SkUnicode::BidiLevel> levels;for(const auto& r:regions)levels.push_back(r.level);
    std::vector<int32_t> order(regions.size());
    unicode->reorderVisual(levels.data(),static_cast<int>(levels.size()),order.data());
    for(auto i:order) {
        const auto& r=regions[i];const auto direction=r.level&1;
        if(found->known[direction])continue;
        for(size_t j=r.start;j<r.end;j++) {
            const size_t index=direction?r.end-1-(j-r.start):j;
            if(text[index]==' '){found->known[direction]=true;found->apply_word[direction]=index!=0;break;}
        }
    }
    options.space_word_ltr=found->apply_word[0];options.space_word_rtl=found->apply_word[1];
    return options;
}

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
// SkMatrix's float inverse can overflow for a valid subnormal CTM.
// Blink inverts in double and clamps when passing the result to Skia.
static bool canvas_matrix_inverse(const SkMatrix& m, SkMatrix* inverse) {
    if (m.invert(inverse)) return true;
    const double a=m.getScaleX(), b=m.getSkewY(), c=m.getSkewX(), d=m.getScaleY();
    const double e=m.getTranslateX(), f=m.getTranslateY(), det=a*d-b*c;
    if (!std::isfinite(det) || det==0) return false;
    const auto scalar=[](double v){return static_cast<float>(std::clamp(v,-double(std::numeric_limits<float>::max()),double(std::numeric_limits<float>::max())));};
    inverse->setAll(scalar(d/det),scalar(-c/det),scalar((c*f-d*e)/det),
                    scalar(-b/det),scalar(a/det),scalar((b*e-a*f)/det),0,0,1);
    return true;
}
static bool prepare_path(Canvas* canvas) {
    if (!canvas || !canvas->surface) return false;
    const SkMatrix current = canvas->surface->getCanvas()->getTotalMatrix();
    SkMatrix inverse;
    if (!canvas_matrix_inverse(current,&inverse)) return false;
    if (current != canvas->path_matrix) {
        canvas->simple_arc = false;canvas->closed_arc=false;
        if (!canvas->path.isEmpty()) {
            canvas->path.transform(SkMatrix::Concat(inverse, canvas->path_matrix));
        }
        canvas->path_matrix = current;
    }
    return true;
}

static bool mutate_path(Canvas* canvas) {
    if (!prepare_path(canvas)) return false;
    canvas->simple_arc = false;canvas->closed_arc=false;
    canvas->line_builder_state = 0;
    canvas->line_path_cached = false;
    return true;
}

static float radians_to_degrees(float radians) {
    return radians * (180.0f / SK_ScalarPI);
}

static SkPaint make_paint(const Canvas* canvas, const Style& style, bool stroke) {
    SkPaint paint;
    paint.setAntiAlias(true);
    paint.setBlendMode(canvas->blend_mode);
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
        // Blink pads stops explicitly: Skia's single-color shortcut can change
        // shadow pixels even when the resulting gradient is a constant color.
        std::vector<SkColor4f> colors = g.colors;
        std::vector<float> positions = g.positions;
        if (colors.empty()) {
            colors.push_back(SkColors::kTransparent);
            positions.push_back(0);
        } else if (positions.front() > 0) {
            colors.insert(colors.begin(), colors.front());
            positions.insert(positions.begin(), 0);
        }
        if (positions.back() < 1) {
            colors.push_back(colors.back());
            positions.push_back(1);
        }
        SkGradient::Interpolation interpolation;
        interpolation.fColorSpace=SkGradient::Interpolation::ColorSpace::kSRGB;
        SkGradient gradient(SkGradient::Colors(
            colors, positions, SkTileMode::kClamp), interpolation);
        sk_sp<SkShader> shader;
        const bool same_centers = g.args[0] == g.args[2] && g.args[1] == g.args[3];
        if ((g.kind == 1 && same_centers) ||
            (g.kind == 2 && same_centers && g.args[4] == g.args[5])) {
            shader = SkShaders::Empty();
        } else if (g.kind == 1) {
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
        if(style.float_color)paint.setColor4f(color,SkColorSpace::MakeSRGB().get());
        else paint.setColor(SkColorSetARGB(
            static_cast<uint8_t>(std::round(style.color.fA * 255.0f)),
            static_cast<uint8_t>(std::round(color.fR * 255.0f)),
            static_cast<uint8_t>(std::round(color.fG * 255.0f)),
            static_cast<uint8_t>(std::round(color.fB * 255.0f))));
        if(!style.float_color)paint.setAlphaf(color.fA);
    }
    return paint;
}

static bool has_visible_shadow(const Canvas* canvas);

static bool intersects_dirty_clip(const Canvas* canvas, const SkRect& bounds) {
    const auto* target=canvas->surface->getCanvas();
    SkIRect clip;
    if(!target->getDeviceClipBounds(&clip))return false;
    SkRect dirty=target->getTotalMatrix().mapRect(bounds);
    if(canvas->shadow.fA>0) {
        SkRect shadow=dirty.makeOffset(canvas->shadow_offset_x,canvas->shadow_offset_y);
        shadow.outset(canvas->shadow_blur,canvas->shadow_blur);
        dirty.join(shadow);
    }
    // Blink culls using shadowBlur, even though the filter kernel can extend
    // farther. Running a culled filter can add a fringe outside these bounds.
    return SkIRect::Intersects(dirty.roundOut(),clip);
}

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

// Image and pattern shadows operate on rendered alpha in device space.
template <typename DrawProc>
static void draw_with_filtered_shadow(Canvas* canvas,const SkPaint& source,DrawProc draw, const SkRect* source_bounds=nullptr) {
    SkPaint filter_paint;
    // cc::DropShadowPaintFilter still serializes its color through SkColor.
    // Draw-loop shadows use float color; image-filter shadows use byte color.
    filter_paint.setBlendMode(canvas->blend_mode);
    filter_paint.setImageFilter(SkImageFilters::DropShadow(canvas->shadow_offset_x,canvas->shadow_offset_y,
        canvas->shadow_blur*.5f,canvas->shadow_blur*.5f,canvas->shadow.toSkColor(),nullptr));
    auto* target=canvas->surface->getCanvas();
    const auto ctm=target->getLocalToDevice();
    SkRect bounds;
    if(source_bounds) ctm.asM33().mapRect(&bounds,*source_bounds);
    target->save();target->resetMatrix();
    target->saveLayer(source_bounds ? &bounds : nullptr,&filter_paint);target->setMatrix(ctm);
    SkPaint layer_source(source);layer_source.setBlendMode(SkBlendMode::kSrcOver);
    draw(target,layer_source);
    target->restore();target->restore();
}

template <typename DrawProc>
static void draw_with_shadow(Canvas* canvas, const Style& style,
                             const SkPaint& source, DrawProc draw,
                             const SkPaint* shadow_source = nullptr, const SkRect* alpha_bounds = nullptr, bool filtered_shadow = false) {
    SkCanvas* target = canvas->surface->getCanvas();
    // ctx.filter runs in device space: a scaled or rotated context does not
    // change a blur radius or a drop-shadow offset. The geometry is drawn into
    // an unscaled layer that carries the filter, then the layer is composited.
    // A shadow is fed from the filtered result, so its colour is never filtered.
    if (canvas->filter) {
        sk_sp<SkImageFilter> chain = canvas->filter;
        sk_sp<SkImageFilter> layer_filter = chain;
        if (has_visible_shadow(canvas)) {
            layer_filter = SkImageFilters::DropShadow(
                canvas->shadow_offset_x, canvas->shadow_offset_y,
                canvas->shadow_blur * .5f, canvas->shadow_blur * .5f,
                canvas->shadow.toSkColor(), std::move(chain));
        }
        SkPaint layer;
        layer.setBlendMode(canvas->blend_mode);
        layer.setImageFilter(layer_filter);
        SkAutoCanvasRestore restore(target, true);
        const auto ctm = target->getLocalToDevice();
        target->resetMatrix();
        target->saveLayer(nullptr, &layer);
        target->setMatrix(ctm);
        SkPaint inner(source);
        inner.setBlendMode(SkBlendMode::kSrcOver);
        draw(target, inner);
        return;
    }
    if(canvas->blend_mode!=SkBlendMode::kSrc && !full_canvas_composite(canvas->blend_mode) && alpha_bounds && !intersects_dirty_clip(canvas,*alpha_bounds))return;
    if (canvas->blend_mode == SkBlendMode::kSrc) {
        target->drawColor(canvas->opaque ? SK_ColorBLACK : SK_ColorTRANSPARENT, SkBlendMode::kSrc);
        SkPaint copy_source(source);
        copy_source.setBlendMode(SkBlendMode::kSrc);
        draw(target, copy_source);
        // Src can lower destination alpha even on an opaque surface.
        // Blink restores opacity with black behind the completed draw.
        if (canvas->opaque) {
            SkRect bounds;
            if(target->getLocalClipBounds(&bounds) && (!alpha_bounds || bounds.intersect(*alpha_bounds))) {
                SkPaint opaque;opaque.setColor(SK_ColorBLACK);opaque.setBlendMode(SkBlendMode::kDstOver);
                target->drawRect(bounds,opaque);
            }
        }
        return;
    }
    const bool composited = full_canvas_composite(canvas->blend_mode) ||
        (has_visible_shadow(canvas) && style.pattern && !shadow_source && !style.pattern->isOpaque()) ||
        (has_visible_shadow(canvas) && canvas->blend_mode!=SkBlendMode::kSrcOver &&
         canvas->blend_mode!=SkBlendMode::kSrcATop && canvas->blend_mode!=SkBlendMode::kDstOut);
    if (composited) {
        SkAutoCanvasRestore restore(target,true);
        const auto ctm=target->getLocalToDevice();
        target->resetMatrix();
        SkPaint composite;composite.setBlendMode(canvas->blend_mode);
        if(has_visible_shadow(canvas)) {
            if(filtered_shadow || (style.pattern && !shadow_source)) {
                SkPaint shadow_composite(composite);
                shadow_composite.setImageFilter(SkImageFilters::DropShadowOnly(canvas->shadow_offset_x,canvas->shadow_offset_y,
                    canvas->shadow_blur*.5f,canvas->shadow_blur*.5f,canvas->shadow.toSkColor(),nullptr));
                if(filtered_shadow) {
                    // drawImage applies its filter inside the compositing layer.
                    target->saveLayer(nullptr,&composite);
                    shadow_composite.setBlendMode(SkBlendMode::kSrcOver);
                    SkRect bounds;
                    if(alpha_bounds)ctm.asM33().mapRect(&bounds,*alpha_bounds);
                    target->saveLayer(alpha_bounds?&bounds:nullptr,&shadow_composite);
                } else target->saveLayer(nullptr,&shadow_composite);
                target->setMatrix(ctm);
                SkPaint foreground(source);foreground.setBlendMode(SkBlendMode::kSrcOver);draw(target,foreground);
                if(filtered_shadow)target->restore();
            } else {
                target->saveLayer(nullptr,&composite);
                target->setMatrix(SkM44(ctm).postTranslate(canvas->shadow_offset_x,canvas->shadow_offset_y));
                SkPaint shadow=make_shadow_paint(canvas,shadow_source ? *shadow_source : source);
                shadow.setBlendMode(SkBlendMode::kSrcOver);draw(target,shadow);
            }
            target->restore();
        }
        target->saveLayer(nullptr,&composite);
        target->setMatrix(ctm);
        SkPaint foreground(source);foreground.setBlendMode(SkBlendMode::kSrcOver);
        draw(target,foreground);
        target->restore();
        if(canvas->opaque)target->drawColor(SK_ColorBLACK,SkBlendMode::kDstOver);
        return;
    }
    if (style.pattern && !shadow_source && has_visible_shadow(canvas)) {
        draw_with_filtered_shadow(canvas,source,draw);
        return;
    }
    // Blink runs the looper even for a transparent source. The mask-filter
    // layer can still affect an antialiased clip, so alpha is not a no-op test.
    if (has_visible_shadow(canvas)) {
        SkAutoCanvasRestore restore(target, true);
        target->setMatrix(target->getLocalToDevice().postTranslate(
            canvas->shadow_offset_x, canvas->shadow_offset_y));
        draw(target, make_shadow_paint(canvas, shadow_source ? *shadow_source : source));
    }
    draw(target, source);
    if(canvas->opaque && canvas->blend_mode!=SkBlendMode::kSrcOver && alpha_bounds) {
        SkPaint opaque;opaque.setColor(SK_ColorBLACK);opaque.setBlendMode(SkBlendMode::kDstOver);
        target->drawRect(*alpha_bounds,opaque);
    }
}

// Blink's draw looper omits a shadow that is exactly coincident with the
// source. Drawing it independently doubles partially covered edge pixels.
static bool has_visible_shadow(const Canvas* canvas) {
    return canvas->shadow.fA > 0 &&
           (canvas->shadow_blur > 0 || canvas->shadow_offset_x != 0 || canvas->shadow_offset_y != 0);
}

static SkRect stroke_bounds(const Canvas* canvas, SkRect bounds) {
    double delta = canvas->line_width / 2.0;
    if (canvas->line_join == SkPaint::kMiter_Join) delta *= canvas->miter_limit;
    else if (canvas->line_cap == SkPaint::kSquare_Cap) delta *= std::sqrt(2.f);
    const float outset = static_cast<float>(std::min(delta, double(std::numeric_limits<float>::max())));
    bounds.outset(outset, outset);
    return bounds;
}
static void draw_path(Canvas* canvas, bool stroke, bool evenodd = false) {
    if (!prepare_path(canvas)) return;
    SkPath path = canvas->path.snapshot();
    path.setIsVolatile(true);
    // An empty current path is a no-op even under copy composition.
    if (path.isEmpty()) return;
    const SkRect bounds = (canvas->simple_arc || canvas->closed_arc) ? canvas->arc_oval : path.getBounds();
    if (stroke && bounds.width() == 0 && bounds.height() == 0) return;
    SkPoint line[2];
    const bool simple_line = canvas->line_builder_state == 2 && path.isLine(line);
    if (!stroke && simple_line) return;
    if (!stroke && evenodd) path.setFillType(SkPathFillType::kEvenOdd);
    const Style& source_style = stroke ? canvas->stroke : canvas->fill;
    SkPaint source = make_paint(canvas, source_style, stroke);
    const SkRect alpha_bounds = stroke ? stroke_bounds(canvas, bounds) : bounds;
    draw_with_shadow(canvas, source_style, source,
                     [&](SkCanvas* draw_canvas, const SkPaint& paint) {
                         if (simple_line) draw_canvas->drawLine(line[0], line[1], paint);
                         else if (canvas->simple_arc) draw_canvas->drawArc(canvas->arc_oval, canvas->arc_start, canvas->arc_sweep, false, paint);
                         else draw_canvas->drawPath(path, paint);
                     }, nullptr, &alpha_bounds);
}

// Path2D draws the supplied path in user space under the live CTM. It never
// takes the line/arc fast paths, which only exist for the current path.
static void draw_explicit_path(Canvas* canvas, const SkPath& source, bool stroke, bool evenodd) {
    if (!canvas || !canvas->surface || source.isEmpty()) return;
    SkPath path = source;
    path.setIsVolatile(true);
    const SkRect bounds = path.getBounds();
    if (stroke && bounds.width() == 0 && bounds.height() == 0) return;
    if (!stroke) path.setFillType(evenodd ? SkPathFillType::kEvenOdd : SkPathFillType::kWinding);
    const Style& source_style = stroke ? canvas->stroke : canvas->fill;
    SkPaint paint = make_paint(canvas, source_style, stroke);
    const SkRect alpha_bounds = stroke ? stroke_bounds(canvas, bounds) : bounds;
    draw_with_shadow(canvas, source_style, paint,
                     [&](SkCanvas* draw_canvas, const SkPaint& used) { draw_canvas->drawPath(path, used); },
                     nullptr, &alpha_bounds);
}

static Style& selected_style(Canvas* canvas, int stroke) { return stroke ? canvas->stroke : canvas->fill; }

// Blink blocks embedded Latin bitmaps only for these two families.
static bool use_embedded_bitmaps(const SkTypeface* face) {
    if (!face) return false;
    SkString family; face->getFamilyName(&family);
    return !family.equals("Calibri") && !family.equals("Courier New");
}
static bool use_linear_metrics(const SkFont& font) {
    // Bitmap strikes have integral GDI advances. Linear metrics would switch
    // DirectWrite back to outline advances even while drawing the bitmap.
    return !(font.isEmbeddedBitmaps() && font.getTypeface() &&
        font.getTypeface()->getTableSize(SkSetFourByteTag('E','B','L','C')));
}

static SkFont resolve_font(const char* family, float size, int weight, int slant, int stretch=5) {
    static sk_sp<SkFontMgr> font_manager = SkFontMgr_New_DirectWrite();
    const int clamped_weight = std::clamp(weight, 1, 1000);
    const auto font_slant = (slant == 1 || slant == 2 || slant == 3) ? SkFontStyle::kItalic_Slant
                                                    : SkFontStyle::kUpright_Slant;
    const SkFontStyle style(clamped_weight, std::clamp(stretch,1,9), font_slant);
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
            if(ch=='\\'&&p[1]){name+=*++p;continue;}
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
    // Blink applies synthetic italics in SkFont rather than DirectWrite's
    // differently slanted font-face simulation.
    bool synthetic_oblique=false;
    if(typeface && typeface->isSyntheticOblique()) {
        SkFontArguments arguments;arguments.setSyntheticOblique(false);
        if(auto upright=typeface->makeClone(arguments)){typeface=std::move(upright);synthetic_oblique=slant!=3;}
    }
    // Blink's Canvas shaping stage passes linearly measured, subpixel glyph
    // runs into Skia. The public DirectWrite font manager otherwise rounds
    // advances differently, so retain these run-level settings here.
    SkFont font(typeface, blink_font_size(size, "CANVAS_GLYPH_SCALE"));
    if(synthetic_oblique)font.setSkewX(-0.25f);
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
    // Blink snaps horizontal baselines after the canvas transform, including
    // fractional device-space positions produced by scaling.
    font.setBaselineSnap(runtime_float("CANVAS_FONT_BASELINE_SNAP", 1.0f) != 0.0f);
    font.setEmbeddedBitmaps(runtime_float("CANVAS_FONT_EMBEDDED_BITMAPS", use_embedded_bitmaps(typeface.get()) ? 1.0f : 0.0f) != 0.0f);
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

static bool zero_width_control(SkUnichar ch) {
    return ch==0xad || (ch>=0x200b && ch<=0x200f) || (ch>=0x202a && ch<=0x202e) ||
        (ch>=0x2060 && ch<=0x206f) || ch==0xfeff;
}
static bool contains_zero_width_control(const char* text,size_t length) {
    const char* cursor=text;while(cursor<text+length)if(zero_width_control(SkUTF::NextUTF8(&cursor,text+length)))return true;
    return false;
}
static bool cursive_script(SkUnichar ch) {
    const auto script=hb_unicode_script(hb_unicode_funcs_get_default(),ch);
    return script==HB_SCRIPT_ARABIC || script==HB_SCRIPT_SYRIAC || script==HB_SCRIPT_MONGOLIAN ||
        script==HB_SCRIPT_NKO || script==HB_SCRIPT_MANDAIC || script==HB_SCRIPT_PHAGS_PA;
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
        clusters_.resize(offset + count);
        levels_.resize(offset + count,info.fBidiLevel);
        return {glyphs_.data() + offset, positions_.data() + offset,
                nullptr, clusters_.data() + offset, position_};
    }
    void commitRunBuffer(const RunInfo& info) override {
        runs_.push_back({glyphs_.size()-info.glyphCount,info.glyphCount,position_.fX,info.fAdvance.fX,info.fBidiLevel});
        position_ += info.fAdvance;
    }
    void commitLine() override {
        if(runs_.empty())return;
        std::vector<SkUnicode::BidiLevel> levels;for(const auto& run:runs_)levels.push_back(run.level);
        std::vector<int32_t> order(runs_.size());
        SkUnicodes::Bidi::Make()->reorderVisual(levels.data(),static_cast<int>(levels.size()),order.data());
        auto glyphs=glyphs_;auto positions=positions_;auto clusters=clusters_;auto glyph_levels=levels_;size_t dst=0;float x=0;
        for(auto index:order){const auto& run=runs_[index];for(size_t j=0;j<run.count;j++,dst++){
            glyphs_[dst]=glyphs[run.start+j];positions_[dst]=positions[run.start+j];
            positions_[dst].fX+=x-run.x;clusters_[dst]=clusters[run.start+j];levels_[dst]=glyph_levels[run.start+j];
        }x+=run.width;}
    }

    void spacing(const char* text, size_t length, const TextOptions& options) {
        double added=0,item_total=0;float total=0;bool saturated=false;
        for(size_t i=0;i<glyphs_.size();i++) {
            const float original_x=positions_[i].fX;
            const float advance=(i+1==glyphs_.size()?position_.fX:positions_[i+1].fX)-original_x;
            double spaced=advance;
            positions_[i].fX+=added;
            if(i+1==glyphs_.size() || clusters_[i]!=clusters_[i+1]) {
                if(clusters_[i]<length) {
                    const char* cursor=text+clusters_[i];const auto ch=SkUTF::NextUTF8(&cursor,text+length);
                    float spacing=0;
                    if(!zero_width_control(ch)&&!cursive_script(ch))spacing+=options.letter;
                    if(ch==0xa0 || (ch==' ' && ((levels_[i]&1)?options.space_word_rtl:options.space_word_ltr)))spacing+=options.word;
                    // Blink stores each spaced glyph advance in signed 16.16.
                    spaced=std::clamp(static_cast<double>(advance)+std::clamp(spacing,-32768.f,32768.f),-32768.0,32768.0);
                    saturated|=std::abs(spacing)>=32768.f || spaced!=static_cast<double>(advance)+spacing;
                    added+=spaced-advance;
                }
            }
            item_total+=spaced;
            // PlainTextNode measures each word and each ordinary space as a
            // separate shape. Round the fixed-point item width to float only
            // at that boundary, then accumulate the item widths.
            const bool space=clusters_[i]<length && text[clusters_[i]]==' ';
            const bool next_space=i+1<glyphs_.size() && clusters_[i+1]<length && text[clusters_[i+1]]==' ';
            if(space || next_space || i+1==glyphs_.size()){total+=static_cast<float>(item_total);item_total=0;}
        }
        position_.fX=saturated?total:static_cast<float>(position_.fX+added);
    }
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
    struct Run {size_t start,count;float x,width;SkUnicode::BidiLevel level;};
    std::vector<Run> runs_;
    SkFont draw_font_;
    SkPoint position_ = {0, 0};
    std::vector<uint32_t> clusters_;
    std::vector<SkUnicode::BidiLevel> levels_;
    std::vector<SkGlyphID> glyphs_;
    std::vector<SkPoint> positions_;
};

static bool has_font_feature(const SkFont& font,const char* tag,hb_script_t script=HB_SCRIPT_INVALID);

static sk_sp<SkTextBlob> shape_text_blob(const char* text, size_t length,
                                        const SkFont& draw_font,
                                        const SkFont& position_font,
                                        bool enable_kern,
                                        float* advance = nullptr,
                                        std::vector<SkGlyphID>* glyphs = nullptr,
                                        std::vector<SkPoint>* positions = nullptr,
                                        bool small_caps = false, const TextOptions& options = {}) {
    auto unicode = SkUnicodes::Bidi::Make();
    auto shaper = SkShapers::HB::ShapeDontWrapOrReorder(unicode, nullptr);
    auto script = SkShapers::HB::ScriptRunIterator(text, length);
    if (!shaper || !script) return nullptr;

    SkShaper::TrivialFontRunIterator font(position_font, length);
    auto bidi = SkShapers::unicode::BidiRunIterator(unicode,text,length,options.rtl?1:0);
    if(!bidi)return nullptr;
    SkShaper::TrivialLanguageRunIterator language("und", length);
    PositionedRunHandler handler(draw_font);
    std::vector<SkShaper::Feature> features;
    if (!enable_kern || !options.kern) features.push_back({SkSetFourByteTag('k','e','r','n'),0,0,length});
    // Blink shapes words separately: pair positioning must not cross a space.
    if (enable_kern) for (size_t i=0;i<length;i++) if (text[i]==' ')
        features.push_back({SkSetFourByteTag('k','e','r','n'),0,i,i+1});
    const auto feature=[&](const char* tag,unsigned value=1){features.push_back({SkSetFourByteTag(tag[0],tag[1],tag[2],tag[3]),value,0,length});};
    if(options.rendering==1){feature("liga",0);feature("clig",0);}
    if(small_caps) {
        switch(options.caps) {
            case 2: feature("smcp");feature("c2sc");break;
            case 3: feature(has_font_feature(position_font,"pcap")?"pcap":"smcp");break;
            case 4:
                if(has_font_feature(position_font,"pcap") && has_font_feature(position_font,"c2pc")){feature("pcap");feature("c2pc");}
                else {feature("smcp");feature("c2sc");}break;
            case 5: feature("unic");break;
            case 6: feature("titl");break;
            default: feature("smcp");break;
        }
    }
    shaper->shape(text, length, font, *bidi, *script, language,
                  features.data(), features.size(),
                  std::numeric_limits<SkScalar>::max(), &handler);
    handler.spacing(text,length,options);
    if (advance) *advance = handler.advance();
    if (glyphs) *glyphs = handler.glyphs();
    if (positions) *positions = handler.positions();
    return handler.makeBlob();
}

static bool has_rtl_text(const char* text,size_t length,const TextOptions& options) {
    std::vector<SkUnicode::BidiRegion> regions;
    SkUnicodes::Bidi::Make()->getBidiRegions(text,static_cast<int>(length),options.rtl?SkUnicode::TextDirection::kRTL:SkUnicode::TextDirection::kLTR,&regions);
    return std::any_of(regions.begin(),regions.end(),[](const auto& run){return (run.level&1)!=0;});
}
static sk_sp<SkTextBlob> make_shaped_text_blob(const char* text, size_t length,
                                               const SkFont& draw_font,
                                               const SkFont& position_font,
                                               float* advance = nullptr, bool small_caps = false, const TextOptions& options = {}) {
    const bool enable_kern = runtime_float("CANVAS_HARFBUZZ_KERN", 1.0f) != 0.0f && options.kern;
    float shaped_advance = 0;
    std::vector<SkGlyphID> shaped_glyphs;
    std::vector<SkPoint> shaped_positions;
    auto shaped = shape_text_blob(text, length, draw_font, position_font,
                                  enable_kern, &shaped_advance,
                                  &shaped_glyphs, &shaped_positions, small_caps, options);
    if (!shaped || !enable_kern) {
        if (advance) *advance = shaped_advance;
        return shaped;
    }

    float unkerned_advance = 0;
    std::vector<SkGlyphID> unkerned_glyphs;
    std::vector<SkPoint> unkerned_positions;
    auto unkerned_options=options;unkerned_options.letter=0;unkerned_options.word=0;unkerned_options.kern=true;
    auto unkerned = shape_text_blob(text, length, draw_font, position_font,
                                    false, &unkerned_advance,
                                    &unkerned_glyphs, &unkerned_positions, small_caps, unkerned_options);
    const size_t direct_count = position_font.textToGlyphs(
        text, length, SkTextEncoding::kUTF8, {});
    std::vector<SkGlyphID> direct_glyphs(direct_count);
    std::vector<SkPoint> direct_positions(direct_count);
    const bool direct_ok = direct_count > 0 && position_font.textToGlyphs(
        text, length, SkTextEncoding::kUTF8,
        SkSpan<SkGlyphID>(direct_glyphs.data(), direct_glyphs.size())) == direct_count;
    // Preserve substituted small-cap glyphs when using hinted advances for drawing.
    if (small_caps && direct_count == unkerned_glyphs.size()) direct_glyphs = unkerned_glyphs;
    if (!unkerned || !direct_ok || contains_zero_width_control(text,length) || has_rtl_text(text,length,options) || shaped_positions.size() != shaped_glyphs.size() ||
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

static bool has_font_feature(const SkFont& font,const char* tag,hb_script_t script) {
    if (!font.getTypeface()) return false;
    if(script!=HB_SCRIPT_INVALID) {
        auto* face=hb_face_create_for_tables([](hb_face_t*,hb_tag_t table,void* data)->hb_blob_t*{
            const auto bytes=static_cast<SkTypeface*>(data)->copyTableData(table);
            return bytes?hb_blob_create(static_cast<const char*>(bytes->data()),static_cast<unsigned>(bytes->size()),HB_MEMORY_MODE_DUPLICATE,nullptr,nullptr):hb_blob_get_empty();
        },font.getTypeface(),nullptr);
        hb_tag_t tags[HB_OT_MAX_TAGS_PER_SCRIPT];unsigned count=HB_OT_MAX_TAGS_PER_SCRIPT;
        hb_ot_tags_from_script_and_language(script,HB_LANGUAGE_INVALID,&count,tags,nullptr,nullptr);
        unsigned script_index=0,feature_index=0;
        hb_ot_layout_table_select_script(face,HB_OT_TAG_GSUB,count,tags,&script_index,nullptr);
        const bool supported=hb_ot_layout_language_find_feature(face,HB_OT_TAG_GSUB,script_index,HB_OT_LAYOUT_DEFAULT_LANGUAGE_INDEX,HB_TAG(tag[0],tag[1],tag[2],tag[3]),&feature_index);
        hb_face_destroy(face);return supported;
    }
    auto table=font.getTypeface()->copyTableData(SkSetFourByteTag('G','S','U','B'));
    if (!table || table->size()<10) return false;
    const auto* bytes=static_cast<const uint8_t*>(table->data());
    const auto u16=[&](size_t offset){return (uint16_t(bytes[offset])<<8)|bytes[offset+1];};
    const size_t features=u16(6);
    if (features>table->size()-2) return false;
    const size_t count=u16(features);
    if (count>(table->size()-features-2)/6) return false;
    for (size_t i=0;i<count;i++) if (std::memcmp(bytes+features+2+i*6,tag,4)==0) return true;
    return false;
}

static bool needs_synthetic_caps(const SkFont& font,int caps,hb_script_t script=HB_SCRIPT_INVALID) {
    switch(caps) {
        case 0: case 6:return false;
        case 2:return !has_font_feature(font,"smcp",script) || !has_font_feature(font,"c2sc",script);
        case 3:return !has_font_feature(font,"pcap",script) && !has_font_feature(font,"smcp",script);
        case 4:return !(has_font_feature(font,"pcap",script) && has_font_feature(font,"c2pc",script)) &&
                           !(has_font_feature(font,"smcp",script) && has_font_feature(font,"c2sc",script));
        case 5:return !has_font_feature(font,"unic",script);
        default:return !has_font_feature(font,"smcp",script);
    }
}

static bool needs_caps_layout(const SkFont& font,const char* text,size_t length,int caps) {
    if(!caps)return false;
    auto scripts=SkShapers::HB::ScriptRunIterator(text,length);
    while(scripts && !scripts->atEnd()){scripts->consume();if(needs_synthetic_caps(font,caps,static_cast<hb_script_t>(scripts->currentScript())))return true;}
    return false;
}

struct CapsRun { std::string text; bool reduced; int caps=0; };
static bool combining_mark(SkUnichar ch) {
    const auto category=hb_unicode_general_category(hb_unicode_funcs_get_default(),ch);
    return category==HB_UNICODE_GENERAL_CATEGORY_NON_SPACING_MARK
        || category==HB_UNICODE_GENERAL_CATEGORY_ENCLOSING_MARK;
}
static std::vector<CapsRun> synthetic_caps_runs(const char* text, size_t length,int caps,bool native_unicase_fallback=false) {
    std::vector<CapsRun> runs;
    std::string leading_marks;
    const char* cursor=text;const char* end=text+length;
    while(cursor<end) {
        auto ch=SkUTF::NextUTF8(&cursor,end);if(ch<0)ch=0xfffd;
        uint32_t upper[3]{};uint32_t count=canvas_uppercase(ch,upper);
        bool reduced=count!=1 || upper[0]!=static_cast<uint32_t>(ch);
        if(caps==2 || caps==4)reduced=true;
        if(caps==5){reduced=!reduced;upper[0]=ch;count=1;}
        const bool combining=combining_mark(ch);
        // Combining marks remain in the run of their base character.
        if(combining && !runs.empty())reduced=runs.back().reduced;
        // Blink carries leading BMP nonspacing accents into the following
        // case run. Spacing and supplementary marks retain their own size.
        if(combining && runs.empty() && ch<=0xffff &&
           hb_unicode_general_category(hb_unicode_funcs_get_default(),ch)==HB_UNICODE_GENERAL_CATEGORY_NON_SPACING_MARK){
            char buffer[SkUTF::kMaxBytesInUTF8Sequence];const size_t n=SkUTF::ToUTF8(ch,buffer);leading_marks.append(buffer,n);continue;
        }
        int run_caps=0;
        if(native_unicase_fallback) {
            run_caps=reduced?1:0;
            if(reduced)count=canvas_lowercase(ch,upper);
            reduced=false;
            if(combining && !runs.empty())run_caps=runs.back().caps;
        }
        if(runs.empty()||runs.back().reduced!=reduced||runs.back().caps!=run_caps)runs.push_back({{},reduced,run_caps});
        if(!leading_marks.empty()){runs.back().text+=leading_marks;leading_marks.clear();}
        for(uint32_t i=0;i<count;i++){char buffer[SkUTF::kMaxBytesInUTF8Sequence];const size_t n=SkUTF::ToUTF8(upper[i],buffer);runs.back().text.append(buffer,n);}
    }
    if(!leading_marks.empty())runs.push_back({std::move(leading_marks),false});
    return runs;
}

struct FontTextRun { std::string text; sk_sp<SkTypeface> face; };
static std::vector<FontTextRun> fallback_runs(const std::string& text,const SkFont& font,const char* families, int slant) {
    static sk_sp<SkFontMgr> manager=SkFontMgr_New_DirectWrite();
    std::vector<FontTextRun> runs;
    const char* cursor=text.data();const char* end=cursor+text.size();
    while(cursor<end){
        const char* start=cursor;auto ch=SkUTF::NextUTF8(&cursor,end);if(ch<0)ch=0xfffd;
        auto face=font.refTypeface();
        if(combining_mark(ch)&&!runs.empty())face=runs.back().face;
        else if(!font.unicharToGlyph(ch)&&manager){
            sk_sp<SkTypeface> fallback;
            std::string name;char quote=0;
            auto match=[&](){
                const auto first=name.find_first_not_of(" \t\r\n"),last=name.find_last_not_of(" \t\r\n");
                if(first!=std::string::npos){
                    auto styles=manager->matchFamily(name.substr(first,last-first+1).c_str());
                    auto candidate=styles&&styles->count()>0?styles->matchStyle(SkFontStyle(face->fontStyle().weight(),face->fontStyle().width(),slant?SkFontStyle::kItalic_Slant:SkFontStyle::kUpright_Slant)):nullptr;
                    if(candidate&&candidate->unicharToGlyph(ch))fallback=std::move(candidate);
                }
                name.clear();
            };
            if(families)for(const char* p=families;;++p){
                const char c=*p;
                if(!c){match();break;}
                if(c=='\\'&&p[1]){name+=*++p;continue;}
                if(quote){if(c==quote)quote=0;else name+=c;}
                else if(c=='\''||c=='"')quote=c;
                else if(c==','){match();if(fallback)break;}
                else name+=c;
            }
            // Blink's Windows Simplified Han list precedes DirectWrite's
            // generic fallback (which otherwise selects Microsoft YaHei).
            if(!fallback && hb_unicode_script(hb_unicode_funcs_get_default(),ch)==HB_SCRIPT_HAN) {
                for(const char* family : {"Noto Sans SC","Noto Sans CJK SC","Microsoft YaHei","SimSun"}) {
                    auto styles=manager->matchFamily(family);
                    auto candidate=styles && styles->count()>0 ? styles->matchStyle(SkFontStyle(face->fontStyle().weight(),face->fontStyle().width(),slant?SkFontStyle::kItalic_Slant:SkFontStyle::kUpright_Slant)) : nullptr;
                    if(candidate && candidate->unicharToGlyph(ch)){fallback=std::move(candidate);break;}
                }
            }
            if(!fallback)fallback=manager->matchFamilyStyleCharacter(nullptr,SkFontStyle(face->fontStyle().weight(),face->fontStyle().width(),slant?SkFontStyle::kItalic_Slant:SkFontStyle::kUpright_Slant),nullptr,0,ch);
            if(fallback)face=std::move(fallback);
        }
        if(runs.empty()||runs.back().face->uniqueID()!=face->uniqueID())runs.push_back({{},face});
        runs.back().text.append(start,cursor-start);
    }
    return runs;
}
static bool needs_font_fallback(const char* text,size_t length,const SkFont& font){
    const char* cursor=text;const char* end=text+length;
    while(cursor<end){auto ch=SkUTF::NextUTF8(&cursor,end);if(ch>=0&&!font.unicharToGlyph(ch))return true;}
    return false;
}

static sk_sp<SkTextBlob> font_runs_blob(const char* text,size_t length,const char* families,
        const SkFont& draw_font,const SkFont& position_font,float* advance,float* output_bounds=nullptr,bool synthetic_caps=true,bool native_small_caps=false,const TextOptions& options={}) {
    SkTextBlobBuilder builder;SkRect combined=SkRect::MakeEmpty();float offset=0;
    // Resolve bidi for the entire string before font fallback splits it.
    // Font subruns of an RTL region must themselves be visited right-to-left.
    struct LayoutRun {FontTextRun font;bool reduced,rtl;int caps;};
    std::vector<LayoutRun> layout;
    auto unicode=SkUnicodes::Bidi::Make();
    std::vector<SkUnicode::BidiRegion> regions;
    unicode->getBidiRegions(text,static_cast<int>(length),options.rtl?SkUnicode::TextDirection::kRTL:SkUnicode::TextDirection::kLTR,&regions);
    std::vector<SkUnicode::BidiLevel> levels;for(const auto& region:regions)levels.push_back(region.level);
    std::vector<int32_t> order(regions.size());unicode->reorderVisual(levels.data(),static_cast<int>(levels.size()),order.data());
    for(auto index:order) {
        const auto& region=regions[index];const bool rtl=(region.level&1)!=0;
        const auto begin=layout.size();
        // Each fallback face has its own OpenType caps support. Resolve it
        // before choosing native features or synthetic case/size conversion.
        for(const auto& font_run:fallback_runs(std::string(text+region.start,region.end-region.start),position_font,families,options.slant)) {
            SkFont run_font(position_font);run_font.setTypeface(font_run.face);
            auto scripts=SkShapers::HB::ScriptRunIterator(font_run.text.data(),font_run.text.size());
            size_t start=0;
            while(scripts && !scripts->atEnd()) {
                scripts->consume();const auto end=scripts->endOfCurrentRun();
                const auto script=static_cast<hb_script_t>(scripts->currentScript());
                const bool synth=needs_synthetic_caps(run_font,options.caps,script);
                const bool unicase_fallback=synth && options.caps==5 && has_font_feature(run_font,"smcp",script);
                const auto caps_runs=synth?synthetic_caps_runs(font_run.text.data()+start,end-start,options.caps,unicase_fallback)
                    :std::vector<CapsRun>{{font_run.text.substr(start,end-start),false,options.caps}};
                for(const auto& run:caps_runs)layout.push_back({{run.text,font_run.face},run.reduced,rtl,run.caps});
                start=end;
            }
        }
        if(rtl)std::reverse(layout.begin()+begin,layout.end());
    }
    for(const auto& run:layout) {
        const auto& font_run=run.font;
        auto run_options=options;run_options.rtl=run.rtl;run_options.caps=run.caps;
        SkFont draw(draw_font),position(position_font);
        auto face=font_run.face;
        bool synthetic=false;
        if(face->isSyntheticOblique() && !face->getTableSize(SkSetFourByteTag('E','B','L','C'))) {SkFontArguments args;args.setSyntheticOblique(false);if(auto clone=face->makeClone(args)){face=std::move(clone);synthetic=options.slant!=3;}}
        draw.setTypeface(face);position.setTypeface(face);
        if(font_run.face->uniqueID()!=position_font.getTypeface()->uniqueID()) {
            draw.setSkewX(synthetic?-0.25f:0);position.setSkewX(synthetic?-0.25f:0);
        }
        draw.setEmbeddedBitmaps(use_embedded_bitmaps(font_run.face.get()));
        position.setEmbeddedBitmaps(use_embedded_bitmaps(font_run.face.get()));
        if(run.reduced) {
            // Blink derives the synthetic face at an integral 70% font size.
            draw.setSize(std::round(draw.getSize()*0.7f));position.setSize(std::round(position.getSize()*0.7f));
            draw.setEmbeddedBitmaps(true);position.setEmbeddedBitmaps(true);
            position.setLinearMetrics(false);
        } else position.setLinearMetrics(use_linear_metrics(position));
        std::vector<SkGlyphID> glyphs;std::vector<SkPoint> positions;float width=0;
        shape_text_blob(font_run.text.data(),font_run.text.size(),draw,position,true,&width,&glyphs,&positions,run.caps!=0,run_options);
        if(glyphs.empty())continue;
        std::vector<SkScalar> widths(glyphs.size());
        position.getWidths(SkSpan<const SkGlyphID>(glyphs.data(),glyphs.size()),SkSpan<SkScalar>(widths.data(),widths.size()));
        float correction=0;
        for(size_t i=0;i<glyphs.size();i++) {
            positions[i].fX+=offset+correction;
            const float fixed=widths[i]*65536.0f;
            correction+=(std::trunc(fixed)-std::floor(fixed+0.5f))/65536.0f;
        }
        const auto& buffer=builder.allocRunPos(draw,static_cast<int>(glyphs.size()));
        std::memcpy(buffer.glyphs,glyphs.data(),glyphs.size()*sizeof(SkGlyphID));
        std::memcpy(buffer.points(),positions.data(),positions.size()*sizeof(SkPoint));
        if(output_bounds) {
            position.setEdging(SkFont::Edging::kSubpixelAntiAlias);
            std::vector<SkRect> bounds(glyphs.size());
            position.getBounds(SkSpan<const SkGlyphID>(glyphs.data(),glyphs.size()),SkSpan<SkRect>(bounds.data(),bounds.size()),nullptr);
            for(size_t i=0;i<bounds.size();i++){bounds[i].offset(positions[i]);combined.join(bounds[i]);}
        }
        offset+=width+correction;
    }
    if(advance)*advance=offset;
    if(offset<0 && offset<combined.left()) {const float width=combined.width()+(combined.left()-offset);combined.fLeft=offset;combined.fRight=offset+width;}
    if(output_bounds){output_bounds[0]=combined.left();output_bounds[1]=combined.top();output_bounds[2]=combined.right();output_bounds[3]=combined.bottom();}
    return builder.make();
}
}

// Graphite Context and the retained GPU resources are process-wide. Node
// workers may call any entry point concurrently, including finalizers.
// Serialize access; recursive locking permits exported helpers to call each other.
static std::recursive_mutex& canvas_gpu_mutex() {
    static auto* mutex=new std::recursive_mutex();
    return *mutex;
}
#define CANVAS_GPU_GUARD std::lock_guard<std::recursive_mutex> canvas_gpu_guard(canvas_gpu_mutex())

extern "C" {
void* skia_text_cache_create() { CANVAS_GPU_GUARD;return new TextCache();}
void skia_text_cache_destroy(void* cache) { CANVAS_GPU_GUARD;delete static_cast<TextCache*>(cache);}
void skia_canvas_set_text_cache(void* value,void* cache) { CANVAS_GPU_GUARD;
    if(auto* c=static_cast<Canvas*>(value))c->text_cache=static_cast<TextCache*>(cache);
}
void* skia_text_context_create(void* cache) { CANVAS_GPU_GUARD;
    auto* canvas=new Canvas();canvas->text_cache=static_cast<TextCache*>(cache);return canvas;
}
void skia_canvas_set_font_options(void* value,int stretch,int caps,int rendering) { CANVAS_GPU_GUARD;
    if(auto* c=static_cast<Canvas*>(value)){c->text_options.stretch=stretch;c->text_options.caps=caps;c->text_options.rendering=rendering;}
}
void skia_canvas_set_image_quality(void* value,int quality) { CANVAS_GPU_GUARD;if(auto* c=static_cast<Canvas*>(value))c->image_quality=quality;}
void* skia_canvas_create(uint32_t width, uint32_t height, int alpha, int color_space, int float16) { CANVAS_GPU_GUARD;
    SkGraphics::Init();
    if (width == 0 || height == 0 || width > 65535 || height > 65535 ||
        static_cast<uint64_t>(width)*height > 268435456) return nullptr;
    auto canvas = std::make_unique<Canvas>();
    canvas->opaque = alpha == 0;
    // Backing stores use premultiplied 8-bit or half-float pixels in the
    // requested color space; ImageData reads convert to unpremultiplied RGBA.
    const uint32_t surface_flags = runtime_float("CANVAS_DEVICE_INDEPENDENT_FONTS", 0.0f) != 0.0f
        ? SkSurfaceProps::kUseDeviceIndependentFonts_Flag : SkSurfaceProps::kDefault_Flag;
    const int pixel_geometry = std::clamp(
        static_cast<int>(runtime_float("CANVAS_PIXEL_GEOMETRY", canvas->opaque ? 1.0f : 0.0f)), 0, 4);
    // Chromium's Windows Skia build uses SK_GAMMA_SRGB and full text contrast.
    const SkSurfaceProps surface_props(surface_flags, static_cast<SkPixelGeometry>(pixel_geometry),
                                       runtime_float("CANVAS_TEXT_CONTRAST", 1.0f),
                                       runtime_float("CANVAS_TEXT_GAMMA", 0.0f));
    const SkColorType color_type = float16 ? kRGBA_F16_SkColorType : runtime_float("CANVAS_GPU_RGBA", 0.0f) != 0.0f
        ? kRGBA_8888_SkColorType : kBGRA_8888_SkColorType;
    const GrSurfaceOrigin surface_origin = runtime_float("CANVAS_GPU_BOTTOM_LEFT", 0.0f) != 0.0f
        ? kBottomLeft_GrSurfaceOrigin : kTopLeft_GrSurfaceOrigin;
    const SkImageInfo image_info = SkImageInfo::Make(
        width, height, color_type, kPremul_SkAlphaType, canvas_color_space(color_space));
    if (runtime_float("CANVAS_RASTER_SURFACE", 0.0f) != 0.0f) {
        canvas->surface = SkSurfaces::Raster(image_info, &surface_props);
        canvas->raster = true;
    } else if (runtime_float("CANVAS_USE_GANESH", 0.0f) == 0.0f) {
        auto& gpu = dawn_graphite_context();
        if (gpu.valid()) {
            skgpu::graphite::RecorderOptions options;
            options.fImageProvider=sk_make_sp<CanvasImageProvider>();
            canvas->recorder = gpu.graphite->makeRecorder(options);
            if (canvas->recorder) canvas->surface = SkSurfaces::RenderTarget(
                canvas->recorder.get(), image_info, skgpu::Mipmapped::kNo, &surface_props);
            canvas->graphite = canvas->surface != nullptr;
        }
    } else {
        auto& gpu = angle_ganesh_context();
        if (gpu.valid()) canvas->surface = SkSurfaces::RenderTarget(
            gpu.ganesh.get(), skgpu::Budgeted::kNo, image_info,
            0, surface_origin, &surface_props);
    }
    if (!canvas->surface) {
        canvas->recorder.reset();canvas->graphite=false;canvas->raster=true;
        canvas->surface=SkSurfaces::Raster(image_info,&surface_props);
    }
    if (!canvas->surface) return nullptr;
    // A protected root frame lets reset remove even clips made before save().
    canvas->surface->getCanvas()->clear(canvas->opaque ? SK_ColorBLACK : SK_ColorTRANSPARENT);
    canvas->surface->getCanvas()->save();
    // Chrome initializes the backing texture before replaying canvas draws.
    // A pending clear otherwise forces a full-size MSAA attachment and shifts
    // the dithering origin relative to Chrome's cropped attachment.
    if (canvas->graphite) {
        auto recording = canvas->recorder->snap();
        if (!recording) return nullptr;
        skgpu::graphite::InsertRecordingInfo info{};
        info.fRecording = recording.get();
        if (dawn_graphite_context().graphite->insertRecording(info) !=
            skgpu::graphite::InsertStatus::kSuccess) return nullptr;
    }
    return canvas.release();
}

void skia_canvas_destroy(void* value) { CANVAS_GPU_GUARD;
    auto* canvas = static_cast<Canvas*>(value);
    if (!canvas) return;
    if (canvas->surface && !canvas->graphite && !canvas->raster) angle_ganesh_context().makeCurrent();
    delete canvas;
}
// While a CTM is singular Blink retains the preceding local path, and maps
// point commands explicitly. setTransform first resets the previous CTM.
static void singular_path_transition(Canvas* c, const SkMatrix& before, bool reset=false) {
    const auto after=c->surface->getCanvas()->getTotalMatrix();
    SkMatrix inverse;
    if (canvas_matrix_inverse(after,&inverse)) return;
    if (canvas_matrix_inverse(before,&inverse)) {
        c->path.transform(SkMatrix::Concat(inverse,c->path_matrix));
        if (reset) c->path.transform(before);
    }
    c->path_matrix=SkMatrix::I();
}
static bool prepare_point_path(Canvas* c, SkPoint* points, size_t count) {
    if (!c || !c->surface) return false;
    SkMatrix inverse;
    const auto matrix=c->surface->getCanvas()->getTotalMatrix();
    if (canvas_matrix_inverse(matrix,&inverse)) return prepare_path(c);
    matrix.mapPoints(SkSpan<SkPoint>(points,count));
    return true;
}
// A matrix change materializes Blink's specialized line/arc builder, even if
// a later restore returns to the original matrix before the next path draw.
void skia_canvas_scale(void* value, float x, float y) { CANVAS_GPU_GUARD;
    if (auto* c = static_cast<Canvas*>(value)) {
        const auto before=c->surface->getCanvas()->getTotalMatrix();
        const bool prepared=prepare_path(c);
        c->surface->getCanvas()->scale(x, y);
        singular_path_transition(c,before);
        SkMatrix inverse;
        if(prepared && before!=c->surface->getCanvas()->getTotalMatrix() && canvas_matrix_inverse(c->surface->getCanvas()->getTotalMatrix(),&inverse)) {
            const auto limit=double(std::numeric_limits<float>::max());
            c->path.transform(SkMatrix::Scale(static_cast<float>(std::clamp(1.0/x,-limit,limit)),static_cast<float>(std::clamp(1.0/y,-limit,limit))));
            c->path_matrix=c->surface->getCanvas()->getTotalMatrix();
        }
        if(before!=c->surface->getCanvas()->getTotalMatrix()){c->line_builder_state=0;c->simple_arc=false;c->closed_arc=false;}
    }
}
void skia_canvas_translate(void* value, float x, float y) { CANVAS_GPU_GUARD;
    if (auto* c = static_cast<Canvas*>(value)) {
        SkMatrix inverse;if(!canvas_matrix_inverse(c->surface->getCanvas()->getTotalMatrix(),&inverse))return;
        const auto before=c->surface->getCanvas()->getTotalMatrix();
        prepare_path(c);
        c->surface->getCanvas()->translate(x, y);
        singular_path_transition(c,before);
        if(before!=c->surface->getCanvas()->getTotalMatrix()) {
            c->path.transform(SkMatrix::Translate(-x,-y));
            c->path_matrix=c->surface->getCanvas()->getTotalMatrix();
        }
        if(before!=c->surface->getCanvas()->getTotalMatrix()){c->line_builder_state=0;c->simple_arc=false;c->closed_arc=false;}
    }
}
void skia_canvas_rotate(void* value, double radians) { CANVAS_GPU_GUARD;
    if (auto* c = static_cast<Canvas*>(value)) {
        const auto before=c->surface->getCanvas()->getTotalMatrix();
        const bool prepared=prepare_path(c);
        c->surface->getCanvas()->rotate(static_cast<float>(radians * (180.0 / double(SK_ScalarPI))));
        singular_path_transition(c,before);
        SkMatrix inverse;
        if(prepared && before!=c->surface->getCanvas()->getTotalMatrix() && canvas_matrix_inverse(c->surface->getCanvas()->getTotalMatrix(),&inverse)) {
            const float sine=static_cast<float>(std::sin(-radians)),cosine=static_cast<float>(std::cos(-radians));
            inverse.setAll(cosine,-sine,0,sine,cosine,0,0,0,1);
            c->path.transform(inverse);
            c->path_matrix=c->surface->getCanvas()->getTotalMatrix();
        }
        if(before!=c->surface->getCanvas()->getTotalMatrix()){c->line_builder_state=0;c->simple_arc=false;c->closed_arc=false;}
    }
}
void skia_canvas_save(void* value) { CANVAS_GPU_GUARD; if (auto* c = static_cast<Canvas*>(value)) c->surface->getCanvas()->save(); }
static SkMatrix logical_matrix(const double* m) {
    const auto scalar=[](double v){const auto limit=double(std::numeric_limits<float>::max());return static_cast<float>(std::clamp(v,-limit,limit));};
    SkMatrix result;result.setAll(scalar(m[0]),scalar(m[2]),scalar(m[4]),scalar(m[1]),scalar(m[3]),scalar(m[5]),0,0,1);return result;
}
static void rebase_logical_path(Canvas* c, const double* before, const double* after) {
    // Blink applies these two transforms separately, using the retained double
    // CTM. Combining float GPU matrices changes path rounding after restore.
    prepare_path(c);
    const auto materializes=[](const double* m){return m[0]*m[3]-m[1]*m[2]!=0 &&
        (m[0]!=1 || m[1]!=0 || m[2]!=0 || m[3]!=1 || m[4]!=0 || m[5]!=0);};
    if(materializes(before)||materializes(after)) {
        c->simple_arc=false;c->closed_arc=false;c->line_builder_state=0;
    }
    if (before[0]*before[3]-before[1]*before[2]!=0) c->path.transform(logical_matrix(before));
    const double det=after[0]*after[3]-after[1]*after[2];
    if (det!=0 && std::isfinite(det)) {
        const double inverse[]={after[3]/det,-after[1]/det,-after[2]/det,after[0]/det,
            (after[2]*after[5]-after[3]*after[4])/det,(after[1]*after[4]-after[0]*after[5])/det};
        c->path.transform(logical_matrix(inverse));
    }
}
void skia_canvas_restore(void* value, const double* logical_before, const double* logical_after) { CANVAS_GPU_GUARD;
    if (auto* c = static_cast<Canvas*>(value); c && c->surface->getCanvas()->getSaveCount() > 2) {
        const auto before=c->surface->getCanvas()->getTotalMatrix();
        rebase_logical_path(c,logical_before,logical_after);
        c->surface->getCanvas()->restore();
        c->path_matrix=c->surface->getCanvas()->getTotalMatrix();
        SkMatrix inverse;if(!canvas_matrix_inverse(c->path_matrix,&inverse))c->path_matrix=SkMatrix::I();
        if(before!=c->surface->getCanvas()->getTotalMatrix()){c->line_builder_state=0;c->simple_arc=false;c->closed_arc=false;}
    }
}
void skia_canvas_set_transform(void* value, float a, float b, float cc, float d, float e, float f, const double* logical_before) { CANVAS_GPU_GUARD;
    auto* c = static_cast<Canvas*>(value); if (!c) return;
    SkMatrix matrix; matrix.setAll(a, cc, e, b, d, f, 0, 0, 1);
    if(!matrix.isIdentity() || matrix!=c->surface->getCanvas()->getTotalMatrix()){c->line_builder_state=0;c->simple_arc=false;c->closed_arc=false;}
    const auto before=c->surface->getCanvas()->getTotalMatrix();
    const double logical_after[]={a,b,cc,d,e,f};
    rebase_logical_path(c,logical_before,logical_after);
    c->surface->getCanvas()->setMatrix(matrix);
    c->path_matrix=matrix;
    SkMatrix inverse;if(!canvas_matrix_inverse(matrix,&inverse))c->path_matrix=SkMatrix::I();
}
void skia_canvas_transform(void* value, float a, float b, float cc, float d, float e, float f) { CANVAS_GPU_GUARD;
    auto* c = static_cast<Canvas*>(value); if (!c) return;
    const auto before=c->surface->getCanvas()->getTotalMatrix();
    SkMatrix matrix; matrix.setAll(a, cc, e, b, d, f, 0, 0, 1); c->surface->getCanvas()->concat(matrix);
    singular_path_transition(c,before);
    if(before!=c->surface->getCanvas()->getTotalMatrix()){c->line_builder_state=0;c->simple_arc=false;c->closed_arc=false;}
}

void skia_canvas_begin_path(void* value) { CANVAS_GPU_GUARD; if (auto* c = static_cast<Canvas*>(value)) { c->path.reset(); c->simple_arc=false;c->closed_arc=false; c->line_builder_state=0; c->line_path_cached=false; c->path_matrix = c->surface->getCanvas()->getTotalMatrix(); SkMatrix inverse; if(!canvas_matrix_inverse(c->path_matrix,&inverse))c->path_matrix=SkMatrix::I(); } }
void skia_canvas_move_to(void* value, float x, float y) { CANVAS_GPU_GUARD;
    SkPoint point={x,y};
    if (auto* c = static_cast<Canvas*>(value); prepare_point_path(c,&point,1)) {
        c->simple_arc=false;c->closed_arc=false;c->line_path_cached=false;
        c->line_builder_state = c->path.isEmpty() ? 1 : 0;
        c->path.moveTo(point);
    }
}
void skia_canvas_line_to(void* value, float x, float y) { CANVAS_GPU_GUARD;
    SkPoint point={x,y};
    if (auto* c = static_cast<Canvas*>(value); prepare_point_path(c,&point,1)) {
        x=point.x();y=point.y();
        c->simple_arc = false;c->closed_arc=false;
        c->line_builder_state = c->path.isEmpty() || c->line_builder_state == 1 ? 2 : 0;
        c->line_path_cached = false;
        // Blink's empty-path line builder records MoveTo + LineTo at the same
        // point. Retain that segment: later appends use general path rendering.
        if (c->path.isEmpty()) c->path.moveTo(x, y);
        c->path.lineTo(x, y);
    }
}
void skia_canvas_quad_to(void* value, float x1, float y1, float x2, float y2) { CANVAS_GPU_GUARD;
    SkPoint points[]={{x1,y1},{x2,y2}};
    if (auto* c = static_cast<Canvas*>(value); prepare_point_path(c,points,2)) {
        c->simple_arc=false;c->closed_arc=false;c->line_builder_state=0;c->line_path_cached=false;
        if (c->path.isEmpty()) c->path.moveTo(x1,y1);
        c->path.quadTo(points[0],points[1]);
    }
}
void skia_canvas_cubic_to(void* value, float x1, float y1, float x2, float y2, float x3, float y3) { CANVAS_GPU_GUARD;
    SkPoint points[]={{x1,y1},{x2,y2},{x3,y3}};
    if (auto* c = static_cast<Canvas*>(value); prepare_point_path(c,points,3)) {
        c->simple_arc=false;c->closed_arc=false;c->line_builder_state=0;c->line_path_cached=false;
        if (c->path.isEmpty()) c->path.moveTo(x1,y1);
        c->path.cubicTo(points[0],points[1],points[2]);
    }
}
void skia_canvas_close_path(void* value) { CANVAS_GPU_GUARD;
    if (auto* c = static_cast<Canvas*>(value)) {
        const auto bounds=c->path.snapshot().getBounds();
        if(c->line_builder_state==2 && bounds.width()==0 && bounds.height()==0){
            const bool preserve_start=c->line_path_cached;
            skia_canvas_begin_path(c);
            if(preserve_start)skia_canvas_move_to(c,bounds.left(),bounds.top());
            return;
        }
        c->closed_arc = c->closed_arc || c->simple_arc;
        c->path.close();c->simple_arc=false;c->line_builder_state=0;
    }
}
void skia_canvas_rect(void* value, float x, float y, float width, float height) { CANVAS_GPU_GUARD;
    if(width==0 && height==0){skia_canvas_move_to(value,x,y);return;}
    if(auto* c=static_cast<Canvas*>(value);mutate_path(c))c->path.addRect(SkRect::MakeXYWH(x,y,width,height));
}
void skia_canvas_round_rect(void* value, float x, float y, float width, float height, const float* radii) { CANVAS_GPU_GUARD;
    if (auto* c = static_cast<Canvas*>(value); mutate_path(c) && radii) {
        if(width==0 || height==0){
            c->path.addRect(SkRect::MakeXYWH(x,y,width,height));
            return;
        }
        const SkRect rect = SkRect::MakeLTRB(std::min(x, x + width), std::min(y, y + height),
                                             std::max(x, x + width), std::max(y, y + height));
        const SkVector corners[4] = {
            {radii[0], radii[1]}, {radii[2], radii[3]},
            {radii[4], radii[5]}, {radii[6], radii[7]}
        };
        const auto direction=(width<0)!=(height<0)?SkPathDirection::kCCW:SkPathDirection::kCW;
        // Blink fixes the contour start at index 0; Skia's default 6/7 changes dashes.
        c->path.addRRect(SkRRect::MakeRectRadii(rect, corners),direction,0);
        // Canvas starts a new subpath at the normalized rectangle origin.
        c->path.moveTo(rect.left(),rect.top());
    }
}
void skia_canvas_arc_to(void* value, float x1, float y1, float x2, float y2, float radius) { CANVAS_GPU_GUARD;
    SkPoint points[]={{x1,y1},{x2,y2}};
    if (auto* c = static_cast<Canvas*>(value); prepare_point_path(c,points,2)) {
        c->simple_arc=false;c->closed_arc=false;c->line_builder_state=0;c->line_path_cached=false;
        if(c->path.isEmpty())c->path.moveTo(points[0]);
        else c->path.arcTo(points[0],points[1],std::max(0.f,radius));
    }
}
void skia_canvas_arc(void* value, float x, float y, float radius, float start, float end, int ccw) { CANVAS_GPU_GUARD;
    if (auto* c = static_cast<Canvas*>(value); mutate_path(c)) {
        // Test the original float angles before canonicalization, as Blink
        // does. Large equal angles can cease to be equal after cancellation.
        if (radius == 0 || start == end) {
            skia_canvas_line_to(c, x + radius * std::cos(start), y + radius * std::sin(start));
            return;
        }
        canonicalize_angle(&start, &end);
        end = directed_end_angle(start, end, ccw != 0);
        const SkRect oval = SkRect::MakeLTRB(x-radius, y-radius, x+radius, y+radius);
        const float degrees = radians_to_degrees(start), sweep = radians_to_degrees(end-start);
        const bool simple_arc = c->path.isEmpty() && radius >= 1;
        if (SkScalarNearlyEqual(std::abs(sweep), 360.0f)) {
            const float half = std::copysign(180.0f, sweep);
            c->path.arcTo(oval, degrees, half, false);
            c->path.arcTo(oval, degrees+half, half, false);
        } else { c->path.arcTo(oval, degrees, sweep, false); }
        if (simple_arc) {
            c->simple_arc=true;c->arc_oval=oval;c->arc_start=degrees;c->arc_sweep=sweep;
        }
    }
}
void skia_canvas_ellipse(void* value, float cx, float cy, float rx, float ry, float rotation, float start, float end, int ccw) { CANVAS_GPU_GUARD;
    auto* c = static_cast<Canvas*>(value); if (!mutate_path(c)) return;
    canonicalize_angle(&start, &end);
    end = directed_end_angle(start, end, ccw != 0);

    if (rx == 0 || ry == 0 || start == end) {
        const double cosine = std::cos(static_cast<double>(rotation));
        const double sine = std::sin(static_cast<double>(rotation));
        auto line_at = [&](float angle) {
            const float x = rx * std::cos(angle), y = ry * std::sin(angle);
            skia_canvas_line_to(c, cx + static_cast<float>(cosine*x-sine*y),
                                  cy + static_cast<float>(sine*x+cosine*y));
        };
        line_at(start);
        if ((rx == 0 && ry == 0) || start == end) return;
        const float quarter = SK_ScalarPI * 0.5f;
        if (!ccw) {
            for (float angle = start - std::fmod(start, quarter) + quarter; angle < end; angle += quarter) line_at(angle);
        } else {
            for (float angle = start - std::fmod(start, quarter); angle > end; angle -= quarter) line_at(angle);
        }
        line_at(end);
        return;
    }

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
void skia_canvas_fill(void* value, int evenodd) { CANVAS_GPU_GUARD; draw_path(static_cast<Canvas*>(value), false, evenodd != 0); }
void skia_canvas_stroke(void* value) { CANVAS_GPU_GUARD; draw_path(static_cast<Canvas*>(value), true); }
void skia_canvas_fill_rect(void* value, float x, float y, float width, float height) { CANVAS_GPU_GUARD;
    auto* c = static_cast<Canvas*>(value); if (!c) return;
    SkRect rect = SkRect::MakeXYWH(x, y, width, height);
    SkCanvas* target = c->surface->getCanvas();
    const SkPaint source = make_paint(c, c->fill, false);
    draw_with_shadow(c, c->fill, source,
                     [&](SkCanvas* draw_canvas, const SkPaint& paint) {
                         draw_canvas->drawRect(rect, paint);
                     }, nullptr, &rect);
}
void skia_canvas_clear_rect(void* value, float x, float y, float width, float height) { CANVAS_GPU_GUARD;
    auto* c = static_cast<Canvas*>(value); if (!c) return;
    SkPaint clear;
    clear.setBlendMode(c->opaque ? SkBlendMode::kSrc : SkBlendMode::kClear);
    clear.setColor(SK_ColorBLACK);
    c->surface->getCanvas()->drawRect(SkRect::MakeXYWH(x, y, width, height), clear);
}
void skia_canvas_stroke_rect(void* value, float x, float y, float width, float height) { CANVAS_GPU_GUARD;
    auto* c = static_cast<Canvas*>(value); if (!c) return;
    SkRect rect = SkRect::MakeLTRB(std::min(x, x+width), std::min(y, y+height),
                                 std::max(x, x+width), std::max(y, y+height));
    SkCanvas* target = c->surface->getCanvas();
    const SkPaint source = make_paint(c, c->stroke, true);
    const SkRect alpha_bounds = stroke_bounds(c, rect);
    draw_with_shadow(c, c->stroke, source,
                     [&](SkCanvas* draw_canvas, const SkPaint& paint) {
                         if ((rect.width() > 0) != (rect.height() > 0)) {
                             draw_canvas->drawPath(SkPathBuilder().moveTo(rect.left(),rect.top())
                                 .lineTo(rect.right(),rect.bottom()).close().detach(), paint);
                         } else draw_canvas->drawRect(rect, paint);
                     }, nullptr, &alpha_bounds);
}
void skia_canvas_clip(void* value, int evenodd) { CANVAS_GPU_GUARD;
    auto* c = static_cast<Canvas*>(value);
    if (!prepare_path(c)) return;
    if(c->line_builder_state)c->line_path_cached=true;
    SkPath path = c->path.snapshot();
    path.setIsVolatile(true);
    if (evenodd) path.setFillType(SkPathFillType::kEvenOdd);
    c->surface->getCanvas()->clipPath(path, SkClipOp::kIntersect, true);
}
int skia_canvas_point_in_path(void* value, float x, float y, int stroke, int evenodd) { CANVAS_GPU_GUARD;
    auto* c = static_cast<Canvas*>(value); if (!prepare_path(c)) return 0;
    if(c->line_builder_state)c->line_path_cached=true;
    SkPoint point = {x, y};
    SkMatrix inverse;
    if (!canvas_matrix_inverse(c->path_matrix,&inverse)) return 0;
    inverse.mapPoints(SkSpan<SkPoint>(&point, 1));
    SkPath path = c->path.snapshot();
    path.setIsVolatile(true);
    if (!stroke && evenodd) path.setFillType(SkPathFillType::kEvenOdd);
    if (!stroke) return path.contains(point);
    SkPathBuilder outline;
    // Include path effects (notably dashes) as well as stroke width/caps/joins.
    if (!skpathutils::FillPathWithPaint(path, make_paint(c, c->stroke, true), &outline)) return 0;
    return outline.snapshot().contains(point);
}

void skia_canvas_set_color(void* value, int stroke, uint8_t r, uint8_t g, uint8_t b, uint8_t a) { CANVAS_GPU_GUARD;
    auto* c = static_cast<Canvas*>(value); if (!c) return;
    Style& style = selected_style(c, stroke); style.gradient.reset(); style.pattern.reset(); style.float_color=false; style.color = {r / 255.f, g / 255.f, b / 255.f, a / 255.f};
}
void skia_canvas_set_color_float(void* value, int stroke, float r, float g, float b, float a) { CANVAS_GPU_GUARD;
    auto* c = static_cast<Canvas*>(value); if (!c) return;
    Style& style = selected_style(c, stroke); style.gradient.reset(); style.pattern.reset(); style.float_color=true; style.color = {r,g,b,a};
}
void skia_canvas_set_gradient(void* value, int stroke, int kind, const float* args, const float* positions, const float* colors, uint32_t count) { CANVAS_GPU_GUARD;
    auto* c = static_cast<Canvas*>(value); if (!c) return;
    auto gradient = std::make_unique<Gradient>(); gradient->kind = kind;
    if (args) std::memcpy(gradient->args, args, sizeof(gradient->args));
    for (uint32_t i = 0; i < count; ++i) {
        gradient->positions.push_back(positions[i]);
        gradient->colors.push_back({colors[i * 4], colors[i * 4 + 1],
                                    colors[i * 4 + 2], colors[i * 4 + 3]});
    }
    selected_style(c, stroke).pattern.reset();
    selected_style(c, stroke).gradient = std::move(gradient);
}
void skia_canvas_set_pattern(void* value, int stroke, const uint8_t* pixels, uint32_t width, uint32_t height, int repeat_x, int repeat_y, const double* matrix, int smoothing, int opaque, int color_space, int float16) { CANVAS_GPU_GUARD;
    auto* c = static_cast<Canvas*>(value); if (!c || !pixels || width == 0 || height == 0) return;
    const size_t stride=float16?8:4;
    // A failed upload is an empty image, never the preceding solid paint.
    selected_style(c, stroke).gradient.reset();
    selected_style(c, stroke).pattern = SkShaders::Color(SK_ColorTRANSPARENT);
    const size_t bytes = static_cast<size_t>(width) * height * stride;
    // Interpolate premultiplied texels, including transparent decal edges.
    // An unpremultiplied shader multiplies alpha again after interpolation.
    auto data = SkData::MakeUninitialized(bytes);
    const auto info = SkImageInfo::Make(width, height, float16?kRGBA_F16_SkColorType:kRGBA_8888_SkColorType, opaque ? kOpaque_SkAlphaType : kPremul_SkAlphaType, canvas_color_space(color_space));
    if (!canvas_convert_pixels(SkPixmap(info.makeAlphaType(opaque ? kOpaque_SkAlphaType : kUnpremul_SkAlphaType), pixels, width * stride),
             info, data->writable_data(), width * stride)) return;
    auto image = SkImages::RasterFromData(info, std::move(data), width * stride);
    if (!image) return;
    if (c->graphite) {
        image = SkImages::TextureFromImage(c->recorder.get(), image);
        if (!image) return;
    }
    const SkTileMode tx = repeat_x ? SkTileMode::kRepeat : SkTileMode::kDecal;
    const SkTileMode ty = repeat_y ? SkTileMode::kRepeat : SkTileMode::kDecal;
    selected_style(c, stroke).gradient.reset();
    SkMatrix local;
    const auto component=[&](int i){return static_cast<float>(std::clamp(matrix[i],-double(std::numeric_limits<float>::max()),double(std::numeric_limits<float>::max())));};
    local.setAll(component(0),component(2),component(4),component(1),component(3),component(5),0,0,1);
    SkMatrix inverse;
    selected_style(c, stroke).pattern = local.invert(&inverse)
        ? image->makeShader(tx, ty, SkSamplingOptions(smoothing ? SkFilterMode::kLinear : SkFilterMode::kNearest), &local)
        : SkShaders::Color(SK_ColorTRANSPARENT);
}
void skia_canvas_set_shadow(void* value, float r, float g, float b, float a, float blur, float offset_x, float offset_y) { CANVAS_GPU_GUARD;
    auto* c = static_cast<Canvas*>(value); if (!c) return; c->shadow = {r, g, b, a}; c->shadow_blur = std::max(0.f, blur); c->shadow_offset_x = offset_x; c->shadow_offset_y = offset_y;
}
void skia_canvas_set_line_width(void* value, float width) { CANVAS_GPU_GUARD; if (auto* c = static_cast<Canvas*>(value)) c->line_width = std::max(0.f, width); }
void skia_canvas_set_stroke_style(void* value, int cap, int join, float miter_limit) { CANVAS_GPU_GUARD;
    auto* c = static_cast<Canvas*>(value); if (!c) return;
    c->line_cap = cap == 1 ? SkPaint::kRound_Cap : cap == 2 ? SkPaint::kSquare_Cap : SkPaint::kButt_Cap;
    c->line_join = join == 1 ? SkPaint::kRound_Join : join == 2 ? SkPaint::kBevel_Join : SkPaint::kMiter_Join;
    c->miter_limit = std::max(0.f, miter_limit);
}
void skia_canvas_set_line_dash(void* value, const float* values, uint32_t count, float offset) { CANVAS_GPU_GUARD;
    auto* c = static_cast<Canvas*>(value); if (!c) return;
    c->line_dash.clear();
    if (values && count) c->line_dash.assign(values, values + count);
    c->line_dash_offset = offset;
}
void skia_canvas_set_global_alpha(void* value, float alpha) { CANVAS_GPU_GUARD; if (auto* c = static_cast<Canvas*>(value)) c->global_alpha = std::clamp(alpha, 0.f, 1.f); }
void skia_canvas_set_composite(void* value, int mode) { CANVAS_GPU_GUARD; if (auto* c = static_cast<Canvas*>(value)) c->blend_mode = static_cast<SkBlendMode>(mode); }
float skia_canvas_spacing_unit(const char* family,float size,int weight,int slant,int ch) { CANVAS_GPU_GUARD;
    SkFont font=resolve_font(family,size,weight,slant);font.setLinearMetrics(use_linear_metrics(font));
    if(ch==1)return font.measureText("0",1,SkTextEncoding::kUTF8);
    SkFontMetrics metrics;font.getMetrics(&metrics);return ch==2?metrics.fCapHeight:metrics.fXHeight;
}
void skia_canvas_set_text_options(void* value,float letter,float word,int kern,int rtl,int slant) { CANVAS_GPU_GUARD;if(auto* c=static_cast<Canvas*>(value))c->text_options={std::trunc(std::clamp(letter,-32768.f,32768.f)*65536.f)/65536.f,std::trunc(std::clamp(word,-32768.f,32768.f)*65536.f)/65536.f,kern!=0,rtl!=0,slant};}
void skia_canvas_set_image_smoothing(void* value, int enabled) { CANVAS_GPU_GUARD; if (auto* c = static_cast<Canvas*>(value)) c->image_smoothing = enabled != 0; }
void skia_canvas_text_bounds(void* value, const char* text, uint32_t length,
                            const char* family, float size, int weight, int slant, float* output, int small_caps);
void skia_canvas_draw_text(void* value, const char* text, uint32_t length,
                           const char* family, float x, float y, float size, int stroke,
                           int weight, int slant, int small_caps, float horizontal_scale) { CANVAS_GPU_GUARD;
    auto* c = static_cast<Canvas*>(value); if (!c || !text) return;
    float ink[4]{};
    skia_canvas_text_bounds(value,text,length,family,size,weight,slant,ink,small_caps);
    SkRect alpha_bounds=SkRect::MakeLTRB(ink[0]+x,ink[1]+y,ink[2]+x,ink[3]+y);
    if(stroke)alpha_bounds=stroke_bounds(c,alpha_bounds);
    const auto options=text_layout_options(c,text,length,family,size,weight,slant,small_caps);
    SkCanvas* target = c->surface->getCanvas();
    // maxWidth scales only this draw; Canvas' current path and primitive
    // builder state must not observe the internal text transform.
    SkAutoCanvasRestore text_restore(target,horizontal_scale!=1);
    // Scale about the canvas origin and compensate the glyph location. A
    // translated origin would incorrectly shift gradient/pattern coordinates.
    if(horizontal_scale!=1){target->scale(horizontal_scale,1);x/=horizontal_scale;}
    // The raster Skia build has DirectWrite enabled. A null typeface has no
    // glyphs in this configuration, so resolve Canvas' sans-serif fallback
    // through the platform font manager before shaping/drawing text.
    SkFont font = resolve_font(family, size, weight, slant,static_cast<Canvas*>(value)->text_options.stretch);
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
    foreground_font.setSkewX(runtime_float("CANVAS_TEXT_FOREGROUND_SKEW_X", font.getSkewX()));
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
                             auto blob = small_caps && needs_caps_layout(position_font,text,length,options.caps)
                                 ? font_runs_blob(text,length,family,draw_font,position_font,nullptr,nullptr,true,false,options)
                                 : needs_font_fallback(text,length,position_font)
                                 ? font_runs_blob(text,length,family,draw_font,position_font,nullptr,nullptr,false,small_caps!=0,options)
                                 : harfbuzz_shaping
                                 ? make_shaped_text_blob(text, length, draw_font, position_font, nullptr, small_caps != 0,options)
                                 : make_positioned_text_blob(text, length, draw_font, position_font);
                             if (blob) {
                                 if (source_style.pattern) {
                                     // Chromium prepares glyph strikes before resolving image
                                     // shaders, using their black fallback for mask luminance.
                                     // Replay that strike with the actual pattern paint.
                                     SkPaint analysis(paint);
                                     analysis.setShader(nullptr);
                                     auto slug = sktext::gpu::Slug::ConvertBlob(
                                         draw_canvas, *blob, {text_x, text_y}, analysis);
                                     if (slug) slug->draw(draw_canvas, paint);
                                     else draw_canvas->drawTextBlob(blob, text_x, text_y, paint);
                                 } else draw_canvas->drawTextBlob(blob, text_x, text_y, paint);
                             }
                         } else {
                             SkTextUtils::Draw(draw_canvas, text, length, SkTextEncoding::kUTF8,
                                               text_x, text_y, draw_font,
                                               paint, SkTextUtils::kLeft_Align);
                         }
                     }, &shadow_source, &alpha_bounds);
}
static float canvas_shaped_metrics(const char* text, uint32_t length, const SkFont& font,
                                  std::vector<SkGlyphID>& glyphs, std::vector<SkPoint>& positions, bool small_caps,const TextOptions& options) {
    float advance=0;
    shape_text_blob(text,length,font,font,true,&advance,&glyphs,&positions,small_caps,options);
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
                               const char* family, float size, int weight, int slant, int small_caps) { CANVAS_GPU_GUARD;
    if (!value || !text) return 0;
    const auto options=text_layout_options(static_cast<Canvas*>(value),text,length,family,size,weight,slant,small_caps);
    SkFont font = resolve_font(family, size, weight, slant,static_cast<Canvas*>(value)->text_options.stretch);
    if(small_caps && needs_caps_layout(font,text,length,options.caps)){float advance=0;font_runs_blob(text,length,family,font,font,&advance,nullptr,true,false,options);return advance;}
    if(needs_font_fallback(text,length,font)){float advance=0;font_runs_blob(text,length,family,font,font,&advance,nullptr,false,small_caps!=0,options);return advance;}
    font.setLinearMetrics(use_linear_metrics(font));
    if (runtime_float("CANVAS_HARFBUZZ_SHAPING", 1.0f) != 0.0f) {
        std::vector<SkGlyphID> glyphs;std::vector<SkPoint> positions;
        const float advance=canvas_shaped_metrics(text,length,font,glyphs,positions,small_caps != 0,options);
        if (!glyphs.empty()) return advance;
    }
    return font.measureText(text, length, SkTextEncoding::kUTF8);
}
void skia_canvas_text_bounds(void* value, const char* text, uint32_t length,
                               const char* family, float size, int weight, int slant, float* output, int small_caps) { CANVAS_GPU_GUARD;
    if (!value || !text || !output) return;
    const auto options=text_layout_options(static_cast<Canvas*>(value),text,length,family,size,weight,slant,small_caps);
    // Blink shapes ordinary spaces separately. A trailing empty item does
    // not extend the ink bounds even when its advance is negative.
    if(length>1 && (options.letter<0 || options.word<0) && std::memchr(text,' ',length) && !has_rtl_text(text,length,options)) {
        SkRect combined=SkRect::MakeEmpty();float offset=0;
        for(size_t start=0;start<length;) {
            size_t end=start+1;if(text[start]!=' ')while(end<length && text[end]!=' ')++end;
            float bounds[4]{};
            skia_canvas_text_bounds(value,text+start,static_cast<uint32_t>(end-start),family,size,weight,slant,bounds,small_caps);
            const float left=bounds[0]+offset;
            combined.join(SkRect::MakeLTRB(left,bounds[1],left+(bounds[2]-bounds[0]),bounds[3]));
            offset+=skia_canvas_measure_text(value,text+start,static_cast<uint32_t>(end-start),family,size,weight,slant,small_caps);
            start=end;
        }
        output[0]=combined.left();output[1]=combined.top();output[2]=combined.right();output[3]=combined.bottom();return;
    }
    SkFont font=resolve_font(family,size,weight,slant,static_cast<Canvas*>(value)->text_options.stretch);
    if(small_caps && needs_caps_layout(font,text,length,options.caps)){font_runs_blob(text,length,family,font,font,nullptr,output,true,false,options);return;}
    if(needs_font_fallback(text,length,font)){font_runs_blob(text,length,family,font,font,nullptr,output,false,small_caps!=0,options);return;}
    font.setLinearMetrics(use_linear_metrics(font));
    std::vector<SkGlyphID> glyphs;
    std::vector<SkPoint> positions;
    const float advance=canvas_shaped_metrics(text,length,font,glyphs,positions,small_caps != 0,options);
    std::vector<SkRect> bounds(glyphs.size());
    // Blink obtains glyph ink bounds using its LCD text edging configuration.
    font.setEdging(SkFont::Edging::kSubpixelAntiAlias);
    font.getBounds(SkSpan<const SkGlyphID>(glyphs.data(),glyphs.size()),SkSpan<SkRect>(bounds.data(),bounds.size()),nullptr);
    SkRect combined=SkRect::MakeEmpty();
    for(size_t i=0;i<bounds.size();i++) {bounds[i].offset(positions[i]);combined.join(bounds[i]);}
    if(advance<0 && advance<combined.left()) {const float width=combined.width()+(combined.left()-advance);combined.fLeft=advance;combined.fRight=advance+width;}
    output[0]=combined.left();output[1]=combined.top();output[2]=combined.right();output[3]=combined.bottom();
}
void skia_canvas_font_metrics(void* value, const char* family, float size,
                              int weight, int slant, float* ascent, float* descent) { CANVAS_GPU_GUARD;
    if (!value || !ascent || !descent) return;
    SkFontMetrics metrics;
    resolve_font(family, size, weight, slant,static_cast<Canvas*>(value)->text_options.stretch).getMetrics(&metrics);
    *ascent = metrics.fAscent;
    *descent = metrics.fDescent;
}
void skia_canvas_typo_metrics(void* value, const char* family, float size,
                              int weight, int slant, float* ascent, float* descent) { CANVAS_GPU_GUARD;
    if (!value || !ascent || !descent) return;
    SkFont font = resolve_font(family, size, weight, slant,static_cast<Canvas*>(value)->text_options.stretch);
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
    // Use the resolved platform size, including Blink's hundredth-pixel
    // font-cache quantization, just as glyph drawing and measurement do.
    const float em_height = font.getSize();
    *ascent = *descent = 0;
    if (a + d > 0 && a >= 0 && d >= 0) {
        *ascent = std::round((a * em_height / (a + d)) * 64.0f) / 64.0f;
        *descent = std::round(em_height * 64.0f) / 64.0f - *ascent;
    }
}
void skia_canvas_reset(void* value) { CANVAS_GPU_GUARD;
    auto* c = static_cast<Canvas*>(value); if (!c || !c->surface) return;
    SkCanvas* target = c->surface->getCanvas();
    target->restoreToCount(1);
    target->resetMatrix();
    target->clear(c->opaque ? SK_ColorBLACK : SK_ColorTRANSPARENT);
    target->save();
    c->path.reset();
    c->path_matrix = SkMatrix::I();
    c->simple_arc = false;c->closed_arc=false;
    c->line_builder_state = 0;
    c->line_path_cached = false;
}
void skia_canvas_clear_bitmap(void* value) { CANVAS_GPU_GUARD;
    auto* c=static_cast<Canvas*>(value); if (!c || !c->surface) return;
    // writePixels ignores the current clip and CTM and preserves the state stack.
    const int width=c->surface->width(), height=c->surface->height();
    std::vector<uint8_t> zeros(static_cast<size_t>(width)*height*4, 0);
    // Chrome's software provider zero-initializes replacement storage, then
    // paints opaque black through the retained clip (independent of the CTM).
    if (c->opaque && !c->raster) for (size_t i=3;i<zeros.size();i+=4) zeros[i]=255;
    c->surface->writePixels(SkPixmap(SkImageInfo::MakeN32Premul(width,height),zeros.data(),static_cast<size_t>(width)*4),0,0);
    if(c->opaque && c->raster)c->surface->getCanvas()->drawColor(SK_ColorBLACK,SkBlendMode::kSrc);
}
void skia_canvas_draw_rgba_image(void* value, const uint8_t* input, uint32_t image_width, uint32_t image_height, int image_opaque, int shadow_opaque, int color_space, int float16,
                                 float sx, float sy, float sw, float sh, float dx, float dy, float dw, float dh) { CANVAS_GPU_GUARD;
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
    // Clip the source explicitly, preserving the source-to-destination map.
    const SkRect original_src=SkRect::MakeXYWH(sx,sy,sw,sh);
    SkRect clipped=original_src;
    if(!clipped.intersect(SkRect::MakeWH(image_width,image_height)))return;
    if(clipped!=original_src) {
        const auto clipped_dst=SkMatrix::RectToRect(original_src,SkRect::MakeXYWH(dx,dy,dw,dh)).mapRect(clipped);
        sx=clipped.x();sy=clipped.y();sw=clipped.width();sh=clipped.height();
        dx=clipped_dst.x();dy=clipped_dst.y();dw=clipped_dst.width();dh=clipped_dst.height();
    }
    const size_t stride=float16?8:4;
    const size_t bytes = static_cast<size_t>(image_width) * image_height * stride;
    auto pixels = SkData::MakeUninitialized(bytes);
    const auto info=SkImageInfo::Make(image_width,image_height,float16?kRGBA_F16_SkColorType:kRGBA_8888_SkColorType,image_opaque ? kOpaque_SkAlphaType : kPremul_SkAlphaType, canvas_color_space(color_space));
    if(!canvas_convert_pixels(SkPixmap(info.makeAlphaType(image_opaque ? kOpaque_SkAlphaType : kUnpremul_SkAlphaType),input,image_width*stride),info,pixels->writable_data(),image_width*stride))return;
    auto image = SkImages::RasterFromData(info, std::move(pixels), image_width * stride);
    if (!image) return;
    // Keep oversized raster images available to SkCanvas' tiled upload path.
    if (c->graphite && image_width <= c->recorder->maxTextureSize() &&
        image_height <= c->recorder->maxTextureSize()) {
        image = SkImages::TextureFromImage(c->recorder.get(), image);
        if (!image) return;
    }
    SkPaint paint;
    paint.setAntiAlias(!c->surface->getCanvas()->getTotalMatrix().rectStaysRect());
    // Blink quantizes the image paint alpha to a byte before GPU composition.
    paint.setAlpha(static_cast<U8CPU>(std::round(c->global_alpha * 255.0f)));
    paint.setBlendMode(c->blend_mode);
    // Chromium PaintOp::MatrixToScalingOperation classifies only a strict
    // enlargement in both decomposed axes as upscale, including rotated images.
    const auto matrix=c->surface->getCanvas()->getTotalMatrix()*
        SkMatrix::RectToRect(SkRect::MakeXYWH(sx,sy,sw,sh),SkRect::MakeXYWH(dx,dy,dw,dh));
    SkSize scale;
    const bool upscale=matrix.decomposeScale(&scale) && scale.width()>1 && scale.height()>1;
    const auto sampling=c->image_smoothing && c->image_quality==2 && upscale
        ?SkSamplingOptions(SkCubicResampler::Mitchell())
        :SkSamplingOptions(c->image_smoothing?SkFilterMode::kLinear:SkFilterMode::kNearest);
    if(!shadow_opaque && (c->blend_mode==SkBlendMode::kSrcOver || c->blend_mode==SkBlendMode::kSrcATop || c->blend_mode==SkBlendMode::kDstOut) && has_visible_shadow(c)) {
        const SkRect source_bounds=SkRect::MakeXYWH(dx,dy,dw,dh);
        if(!intersects_dirty_clip(c,source_bounds))return;
        draw_with_filtered_shadow(c,paint,[&](SkCanvas* target,const SkPaint& image_paint){
            SkTiledImageUtils::DrawImageRect(target,image.get(),SkRect::MakeXYWH(sx,sy,sw,sh),SkRect::MakeXYWH(dx,dy,dw,dh),sampling,&image_paint,SkCanvas::kFast_SrcRectConstraint);
        }, &source_bounds);
        return;
    }
    Style image_style;
    image_style.color={1,1,1,1};
    const SkRect alpha_bounds=SkRect::MakeXYWH(dx,dy,dw,dh);
    draw_with_shadow(c,image_style,paint,[&](SkCanvas* target,const SkPaint& image_paint){
    SkTiledImageUtils::DrawImageRect(target,image.get(), SkRect::MakeXYWH(sx, sy, sw, sh),
                                           SkRect::MakeXYWH(dx, dy, dw, dh),
                                           sampling, &image_paint,
                                           SkCanvas::kFast_SrcRectConstraint);
    },nullptr,&alpha_bounds,!shadow_opaque);
}
void skia_canvas_read(void* value, int32_t x, int32_t y, uint32_t width, uint32_t height, uint8_t* output, int color_space, int float16) { CANVAS_GPU_GUARD;
    auto* c = static_cast<Canvas*>(value); if (!output) return;
    const size_t stride=float16?8:4;
    const SkColorType type=float16?kRGBA_F16_SkColorType:kRGBA_8888_SkColorType;
    const auto space=canvas_color_space(color_space);
    std::memset(output, 0, static_cast<size_t>(width) * height * stride);
    if (!c || !c->surface || width == 0 || height == 0) return;
    const int32_t left = std::max<int32_t>(0, x);
    const int32_t top = std::max<int32_t>(0, y);
    const int64_t right = std::min<int64_t>(static_cast<int32_t>(c->surface->width()), static_cast<int64_t>(x) + width);
    const int64_t bottom = std::min<int64_t>(static_cast<int32_t>(c->surface->height()), static_cast<int64_t>(y) + height);
    if (right <= left || bottom <= top) return;
    const uint32_t copy_width = static_cast<uint32_t>(right - left);
    const uint32_t copy_height = static_cast<uint32_t>(bottom - top);
    const size_t destination_offset = (static_cast<size_t>(top - y) * width + static_cast<uint32_t>(left - x)) * stride;
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

        const bool convert = float16 || color_space || !c->surface->imageInfo().colorSpace()->isSRGB();
        const auto native_info=c->surface->imageInfo().makeDimensions(SkISize::Make(copy_width,copy_height));
        std::vector<uint8_t> native_pixels(convert ? native_info.computeMinByteSize() : 0);
        struct ReadbackContext {
            uint8_t* destination;
            size_t destination_row_bytes;
            size_t copy_row_bytes;
            uint32_t height;
            bool success = false;
        } readback{
            convert ? native_pixels.data() : output + destination_offset,
            convert ? native_info.minRowBytes() : static_cast<size_t>(width) * stride,
            convert ? native_info.minRowBytes() : static_cast<size_t>(copy_width) * stride,
            copy_height,
        };
        // Opaque backing stores bypass alpha conversion, including the rare
        // partial alpha left at a transformed copy/clip edge.
        gpu.graphite->asyncRescaleAndReadPixels(
            c->surface.get(),
            convert ? native_info : SkImageInfo::Make(copy_width, copy_height, type,
                              c->opaque ? kPremul_SkAlphaType : kUnpremul_SkAlphaType, space),
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
        if(convert && readback.success) {
            canvas_convert_pixels(SkPixmap(c->opaque?native_info.makeAlphaType(kOpaque_SkAlphaType):native_info,native_pixels.data(),native_info.minRowBytes()),
                SkImageInfo::Make(copy_width,copy_height,type,c->opaque?kPremul_SkAlphaType:kUnpremul_SkAlphaType,space),
                output+destination_offset,static_cast<size_t>(width)*stride);
        }
        return;
    }

    if(c->raster) {
        SkPixmap pixels;
        if(c->surface->peekPixels(&pixels)) {
            SkPixmap subset;
            if(pixels.extractSubset(&subset,SkIRect::MakeXYWH(left,top,copy_width,copy_height)))
                canvas_convert_pixels(subset,SkImageInfo::Make(copy_width,copy_height,type,
                    kUnpremul_SkAlphaType,space),output+destination_offset,static_cast<size_t>(width)*stride);
        }
        return;
    }
    if (!angle_ganesh_context().makeCurrent()) return;
    skgpu::ganesh::FlushAndSubmit(c->surface.get());
    if (float16 || color_space || runtime_float("CANVAS_READBACK_RP", 0.0f) == 0.0f) {
        c->surface->readPixels(SkImageInfo::Make(copy_width, copy_height, type, kUnpremul_SkAlphaType, space),
                               output + destination_offset, static_cast<size_t>(width) * stride, left, top);
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
                       int32_t x, int32_t y, int color_space, int float16) { CANVAS_GPU_GUARD;
    auto* c = static_cast<Canvas*>(value); if (!c || !c->surface || !input || source_width == 0 || source_height == 0) return;
    const size_t stride=float16?8:4;
    const int32_t left = std::max<int32_t>(0, x);
    const int32_t top = std::max<int32_t>(0, y);
    const int64_t right = std::min<int64_t>(static_cast<int32_t>(c->surface->width()), static_cast<int64_t>(x) + source_width);
    const int64_t bottom = std::min<int64_t>(static_cast<int32_t>(c->surface->height()), static_cast<int64_t>(y) + source_height);
    if (right <= left || bottom <= top) return;
    const uint32_t copy_width = static_cast<uint32_t>(right - left);
    const uint32_t copy_height = static_cast<uint32_t>(bottom - top);
    const size_t source_offset = (static_cast<size_t>(top - y) * source_width + static_cast<uint32_t>(left - x)) * stride;
    SkPixmap source(SkImageInfo::Make(copy_width, copy_height, float16?kRGBA_F16_SkColorType:kRGBA_8888_SkColorType, c->opaque ? kOpaque_SkAlphaType : kUnpremul_SkAlphaType, canvas_color_space(color_space)),
                    input + source_offset, static_cast<size_t>(source_width) * stride);
    // Blink first changes the byte depth while retaining ImageData's color
    // space and unpremultiplied alpha. Only then does WritePixels convert gamut
    // and alpha. Combining these steps changes HDR clipping and half rounding.
    std::vector<uint8_t> reformatted;
    const auto surface_type=c->surface->imageInfo().colorType();
    if(source.info().bytesPerPixel()!=c->surface->imageInfo().bytesPerPixel()) {
        const auto reformatted_info=source.info().makeColorType(surface_type).makeAlphaType(kUnpremul_SkAlphaType);
        reformatted.resize(reformatted_info.computeMinByteSize());
        if(!canvas_convert_pixels(SkPixmap(source.info().makeAlphaType(kUnpremul_SkAlphaType),source.addr(),source.rowBytes()),
            reformatted_info,reformatted.data(),reformatted_info.minRowBytes()))return;
        source=SkPixmap(reformatted_info.makeAlphaType(c->opaque?kOpaque_SkAlphaType:kUnpremul_SkAlphaType),
                        reformatted.data(),reformatted_info.minRowBytes());
    }
    const auto target_info=c->surface->imageInfo().makeDimensions(SkISize::Make(copy_width,copy_height));
    if(target_info.colorType()==kRGBA_F16_SkColorType) {
        std::vector<uint8_t> converted(target_info.computeMinByteSize());
        if(canvas_convert_pixels(source,target_info,converted.data(),target_info.minRowBytes()))
            c->surface->writePixels(SkPixmap(target_info,converted.data(),target_info.minRowBytes()),left,top);
    } else c->surface->writePixels(source, left, top);
}

// ---------------------------------------------------------------------------
// Path2D: a standalone path in user coordinates. Unlike the current path of a
// context it carries no CTM bookkeeping, because the transform applies when the
// path is filled, stroked or clipped rather than when it is built.
struct CanvasPath { SkPathBuilder builder; };

// Each filter function arrives as eight floats: kind, three parameters and an
// RGBA colour. CSS parsing stays on the Rust side next to the other CSS code.
static sk_sp<SkColorFilter> css_matrix_filter(const float m[20]) {
    return SkColorFilters::Matrix(m);
}
static sk_sp<SkColorFilter> saturate_filter(float s) {
    const float m[20] = {
        0.213f + 0.787f * s, 0.715f - 0.715f * s, 0.072f - 0.072f * s, 0, 0,
        0.213f - 0.213f * s, 0.715f + 0.285f * s, 0.072f - 0.072f * s, 0, 0,
        0.213f - 0.213f * s, 0.715f - 0.715f * s, 0.072f + 0.928f * s, 0, 0,
        0, 0, 0, 1, 0};
    return css_matrix_filter(m);
}
static sk_sp<SkColorFilter> sepia_filter(float amount) {
    const float a = 1.0f - amount;
    const float m[20] = {
        0.393f + 0.607f * a, 0.769f - 0.769f * a, 0.189f - 0.189f * a, 0, 0,
        0.349f - 0.349f * a, 0.686f + 0.314f * a, 0.168f - 0.168f * a, 0, 0,
        0.272f - 0.272f * a, 0.534f - 0.534f * a, 0.131f + 0.869f * a, 0, 0,
        0, 0, 0, 1, 0};
    return css_matrix_filter(m);
}
static sk_sp<SkColorFilter> hue_rotate_filter(float degrees) {
    const float radians = degrees * SK_ScalarPI / 180.0f;
    const float c = std::cos(radians), s = std::sin(radians);
    const float m[20] = {
        0.213f + c * 0.787f - s * 0.213f, 0.715f - c * 0.715f - s * 0.715f, 0.072f - c * 0.072f + s * 0.928f, 0, 0,
        0.213f - c * 0.213f + s * 0.143f, 0.715f + c * 0.285f + s * 0.140f, 0.072f - c * 0.072f - s * 0.283f, 0, 0,
        0.213f - c * 0.213f - s * 0.787f, 0.715f - c * 0.715f + s * 0.715f, 0.072f + c * 0.928f + s * 0.072f, 0, 0,
        0, 0, 0, 1, 0};
    return css_matrix_filter(m);
}
static sk_sp<SkColorFilter> linear_filter(float slope, float intercept, bool alpha_only) {
    float m[20] = {0};
    if (alpha_only) {
        m[0] = m[6] = m[12] = 1;
        m[18] = slope;
    } else {
        m[0] = m[6] = m[12] = slope;
        m[4] = m[9] = m[14] = intercept;
        m[18] = 1;
    }
    return css_matrix_filter(m);
}

void skia_canvas_set_filter(void* value, const float* ops, uint32_t count) { CANVAS_GPU_GUARD;
    auto* c = static_cast<Canvas*>(value); if (!c) return;
    c->filter = nullptr;
    if (!ops || count == 0) return;

    sk_sp<SkImageFilter> chain;
    sk_sp<SkColorFilter> pending;
    auto flush = [&]() {
        if (!pending) return;
        chain = SkImageFilters::ColorFilter(pending, chain);
        pending = nullptr;
    };
    auto add_color = [&](sk_sp<SkColorFilter> next) {
        pending = pending ? SkColorFilters::Compose(next, pending) : next;
    };
    for (uint32_t i = 0; i < count; i++) {
        const float* op = ops + i * 8;
        const int kind = static_cast<int>(op[0]);
        const float amount = op[1];
        switch (kind) {
            case 1: flush(); chain = SkImageFilters::Blur(amount, amount, chain); break;
            case 2: add_color(linear_filter(amount, 0, false)); break;
            case 3: add_color(linear_filter(amount, -(0.5f * amount) + 0.5f, false)); break;
            case 4: add_color(saturate_filter(1.0f - std::clamp(amount, 0.0f, 1.0f))); break;
            case 5: add_color(hue_rotate_filter(amount)); break;
            case 6: { const float a = std::clamp(amount, 0.0f, 1.0f);
                      add_color(linear_filter(1.0f - 2.0f * a, a, false)); break; }
            case 7: add_color(linear_filter(std::clamp(amount, 0.0f, 1.0f), 0, true)); break;
            case 8: add_color(saturate_filter(amount)); break;
            case 9: add_color(sepia_filter(std::clamp(amount, 0.0f, 1.0f))); break;
            case 10: {
                flush();
                const SkColor4f colour = {op[4], op[5], op[6], op[7]};
                chain = SkImageFilters::DropShadow(op[1], op[2], op[3] * 0.5f, op[3] * 0.5f,
                                                   colour.toSkColor(), chain);
                break;
            }
            default: break;
        }
    }
    flush();
    c->filter = chain;
}

// ---------------------------------------------------------------------------
// Image encoding for convertToBlob() and decoding for createImageBitmap().
// Pixels cross this boundary as unpremultiplied 8-bit sRGB RGBA.

static void register_codecs() {
    static std::once_flag once;
    std::call_once(once, [] {
        SkCodecs::Register(SkPngDecoder::Decoder());
        SkCodecs::Register(SkJpegDecoder::Decoder());
        SkCodecs::Register(SkWebpDecoder::Decoder());
    });
}

static uint8_t* copy_out(const void* data, size_t length, size_t* out_length) {
    auto* buffer = static_cast<uint8_t*>(std::malloc(length ? length : 1));
    if (!buffer) { if (out_length) *out_length = 0; return nullptr; }
    if (length) std::memcpy(buffer, data, length);
    if (out_length) *out_length = length;
    return buffer;
}

void skia_buffer_free(uint8_t* data) { std::free(data); }

uint8_t* skia_encode_image(const uint8_t* pixels, uint32_t width, uint32_t height,
                           int format, float quality, size_t* out_length) { CANVAS_GPU_GUARD;
    if (out_length) *out_length = 0;
    if (!pixels || width == 0 || height == 0) return nullptr;
    SkGraphics::Init();
    const SkImageInfo info = SkImageInfo::Make(width, height, kRGBA_8888_SkColorType,
                                               kUnpremul_SkAlphaType, SkColorSpace::MakeSRGB());
    const SkPixmap pixmap(info, pixels, static_cast<size_t>(width) * 4);
    // Chrome clamps a missing or out-of-range quality to the format default.
    const bool usable = std::isfinite(quality) && quality >= 0.0f && quality <= 1.0f;
    const float requested = usable ? quality : 1.0f;
    sk_sp<SkData> encoded;
    if (format == 1) {
        SkJpegEncoder::Options options;
        options.fQuality = static_cast<int>(std::lround(requested * 100.0f));
        // At full quality Chrome keeps full chroma resolution.
        if (options.fQuality >= 100) options.fDownsample = SkJpegEncoder::Downsample::k444;
        encoded = SkJpegEncoder::Encode(pixmap, options);
    } else if (format == 2) {
        SkWebpEncoder::Options options;
        if (requested >= 1.0f) {
            options.fCompression = SkWebpEncoder::Compression::kLossless;
            options.fQuality = 100.0f;  // for lossless this is the effort level
        } else {
            options.fCompression = SkWebpEncoder::Compression::kLossy;
            options.fQuality = requested * 100.0f;
        }
        encoded = SkWebpEncoder::Encode(pixmap, options);
    } else {
        SkPngEncoder::Options options;
        encoded = SkPngEncoder::Encode(pixmap, options);
    }
    if (!encoded) return nullptr;
    return copy_out(encoded->data(), encoded->size(), out_length);
}

uint8_t* skia_decode_image(const uint8_t* data, size_t length,
                           uint32_t* out_width, uint32_t* out_height) { CANVAS_GPU_GUARD;
    if (out_width) *out_width = 0;
    if (out_height) *out_height = 0;
    if (!data || length == 0) return nullptr;
    SkGraphics::Init();
    register_codecs();
    auto encoded = SkData::MakeWithCopy(data, length);
    auto codec = SkCodec::MakeFromData(std::move(encoded));
    if (!codec) return nullptr;
    const SkImageInfo info = codec->getInfo()
        .makeColorType(kRGBA_8888_SkColorType)
        .makeAlphaType(kUnpremul_SkAlphaType)
        .makeColorSpace(SkColorSpace::MakeSRGB());
    if (info.width() <= 0 || info.height() <= 0) return nullptr;
    const size_t row_bytes = static_cast<size_t>(info.width()) * 4;
    const size_t total = row_bytes * static_cast<size_t>(info.height());
    std::vector<uint8_t> pixels(total);
    if (codec->getPixels(info, pixels.data(), row_bytes) != SkCodec::kSuccess) return nullptr;
    if (out_width) *out_width = static_cast<uint32_t>(info.width());
    if (out_height) *out_height = static_cast<uint32_t>(info.height());
    return copy_out(pixels.data(), total, nullptr);
}

void* skia_path_create() { CANVAS_GPU_GUARD; return new CanvasPath(); }
void skia_path_destroy(void* value) { CANVAS_GPU_GUARD; delete static_cast<CanvasPath*>(value); }
void* skia_path_clone(const void* value) { CANVAS_GPU_GUARD;
    auto* path = new CanvasPath();
    if (auto* source = static_cast<CanvasPath*>(const_cast<void*>(value))) {
        path->builder.addPath(source->builder.snapshot());
    }
    return path;
}
int skia_path_from_svg(void* value, const char* text) { CANVAS_GPU_GUARD;
    auto* p = static_cast<CanvasPath*>(value);
    if (!p || !text) return 0;
    SkPath parsed;
    if (!SkParsePath::FromSVGString(text, &parsed)) return 0;
    p->builder.addPath(parsed);
    return 1;
}
void skia_path_move_to(void* value, float x, float y) { CANVAS_GPU_GUARD;
    if (auto* p = static_cast<CanvasPath*>(value)) p->builder.moveTo(x, y);
}
void skia_path_line_to(void* value, float x, float y) { CANVAS_GPU_GUARD;
    if (auto* p = static_cast<CanvasPath*>(value)) {
        if (p->builder.isEmpty()) p->builder.moveTo(x, y);
        p->builder.lineTo(x, y);
    }
}
void skia_path_quad_to(void* value, float x1, float y1, float x2, float y2) { CANVAS_GPU_GUARD;
    if (auto* p = static_cast<CanvasPath*>(value)) {
        if (p->builder.isEmpty()) p->builder.moveTo(x1, y1);
        p->builder.quadTo({x1, y1}, {x2, y2});
    }
}
void skia_path_cubic_to(void* value, float x1, float y1, float x2, float y2, float x3, float y3) { CANVAS_GPU_GUARD;
    if (auto* p = static_cast<CanvasPath*>(value)) {
        if (p->builder.isEmpty()) p->builder.moveTo(x1, y1);
        p->builder.cubicTo({x1, y1}, {x2, y2}, {x3, y3});
    }
}
void skia_path_close(void* value) { CANVAS_GPU_GUARD;
    if (auto* p = static_cast<CanvasPath*>(value); p && !p->builder.isEmpty()) p->builder.close();
}
void skia_path_rect(void* value, float x, float y, float width, float height) { CANVAS_GPU_GUARD;
    auto* p = static_cast<CanvasPath*>(value); if (!p) return;
    if (width == 0 && height == 0) { p->builder.moveTo(x, y); return; }
    p->builder.addRect(SkRect::MakeXYWH(x, y, width, height));
}
void skia_path_round_rect(void* value, float x, float y, float width, float height, const float* radii) { CANVAS_GPU_GUARD;
    auto* p = static_cast<CanvasPath*>(value); if (!p || !radii) return;
    if (width == 0 || height == 0) { p->builder.addRect(SkRect::MakeXYWH(x, y, width, height)); return; }
    const SkRect rect = SkRect::MakeLTRB(std::min(x, x + width), std::min(y, y + height),
                                         std::max(x, x + width), std::max(y, y + height));
    const SkVector corners[4] = {{radii[0], radii[1]}, {radii[2], radii[3]},
                                 {radii[4], radii[5]}, {radii[6], radii[7]}};
    const auto direction = (width < 0) != (height < 0) ? SkPathDirection::kCCW : SkPathDirection::kCW;
    p->builder.addRRect(SkRRect::MakeRectRadii(rect, corners), direction, 0);
    p->builder.moveTo(rect.left(), rect.top());
}
void skia_path_arc_to(void* value, float x1, float y1, float x2, float y2, float radius) { CANVAS_GPU_GUARD;
    auto* p = static_cast<CanvasPath*>(value); if (!p) return;
    if (p->builder.isEmpty()) p->builder.moveTo(x1, y1);
    else p->builder.arcTo({x1, y1}, {x2, y2}, std::max(0.f, radius));
}
void skia_path_arc(void* value, float x, float y, float radius, float start, float end, int ccw) { CANVAS_GPU_GUARD;
    auto* p = static_cast<CanvasPath*>(value); if (!p) return;
    if (radius == 0 || start == end) {
        skia_path_line_to(p, x + radius * std::cos(start), y + radius * std::sin(start));
        return;
    }
    canonicalize_angle(&start, &end);
    end = directed_end_angle(start, end, ccw != 0);
    const SkRect oval = SkRect::MakeLTRB(x - radius, y - radius, x + radius, y + radius);
    const float degrees = radians_to_degrees(start), sweep = radians_to_degrees(end - start);
    if (SkScalarNearlyEqual(std::abs(sweep), 360.0f)) {
        const float half = std::copysign(180.0f, sweep);
        p->builder.arcTo(oval, degrees, half, false);
        p->builder.arcTo(oval, degrees + half, half, false);
    } else p->builder.arcTo(oval, degrees, sweep, false);
}
void skia_path_ellipse(void* value, float cx, float cy, float rx, float ry, float rotation,
                       float start, float end, int ccw) { CANVAS_GPU_GUARD;
    auto* p = static_cast<CanvasPath*>(value); if (!p) return;
    canonicalize_angle(&start, &end);
    end = directed_end_angle(start, end, ccw != 0);
    if (rx == 0 || ry == 0 || start == end) {
        const double cosine = std::cos(static_cast<double>(rotation));
        const double sine = std::sin(static_cast<double>(rotation));
        auto line_at = [&](float angle) {
            const float px = rx * std::cos(angle), py = ry * std::sin(angle);
            skia_path_line_to(p, cx + static_cast<float>(cosine * px - sine * py),
                                 cy + static_cast<float>(sine * px + cosine * py));
        };
        line_at(start);
        if ((rx == 0 && ry == 0) || start == end) return;
        const float quarter = SK_ScalarPI * 0.5f;
        if (!ccw) {
            for (float angle = start - std::fmod(start, quarter) + quarter; angle < end; angle += quarter) line_at(angle);
        } else {
            for (float angle = start - std::fmod(start, quarter); angle > end; angle -= quarter) line_at(angle);
        }
        line_at(end);
        return;
    }
    SkMatrix forward = SkMatrix::I();
    if (rotation != 0) {
        const double cosine = std::cos(static_cast<double>(rotation));
        const double sine = std::sin(static_cast<double>(rotation));
        const double determinant = cosine * cosine + sine * sine;
        SkMatrix inverse;
        inverse.setAll(static_cast<float>(cosine / determinant), static_cast<float>(sine / determinant),
                       static_cast<float>((-sine * cy - cosine * cx) / determinant),
                       static_cast<float>(-sine / determinant), static_cast<float>(cosine / determinant),
                       static_cast<float>((sine * cx - cosine * cy) / determinant), 0, 0, 1);
        p->builder.transform(inverse);
        forward.setAll(static_cast<float>(cosine), static_cast<float>(-sine), cx,
                       static_cast<float>(sine), static_cast<float>(cosine), cy, 0, 0, 1);
    }
    const SkRect oval = rotation == 0 ? SkRect::MakeLTRB(cx - rx, cy - ry, cx + rx, cy + ry)
                                      : SkRect::MakeLTRB(-rx, -ry, rx, ry);
    const float start_degrees = radians_to_degrees(start);
    const float sweep_degrees = radians_to_degrees(end - start);
    if (SkScalarNearlyEqual(std::abs(sweep_degrees), 360.0f)) {
        const float sweep180 = std::copysign(180.0f, sweep_degrees);
        p->builder.arcTo(oval, start_degrees, sweep180, false);
        p->builder.arcTo(oval, start_degrees + sweep180, sweep180, false);
    } else p->builder.arcTo(oval, start_degrees, sweep_degrees, false);
    if (rotation != 0) p->builder.transform(forward);
}
void skia_path_add_path(void* target, const void* source, const double* matrix) { CANVAS_GPU_GUARD;
    auto* destination = static_cast<CanvasPath*>(target);
    auto* addition = static_cast<CanvasPath*>(const_cast<void*>(source));
    if (!destination || !addition) return;
    SkPath path = addition->builder.snapshot();
    if (matrix) path = path.makeTransform(logical_matrix(matrix));
    destination->builder.addPath(path);
}

static SkPath explicit_path(const void* value, bool evenodd) {
    auto* p = static_cast<CanvasPath*>(const_cast<void*>(value));
    SkPath path = p ? p->builder.snapshot() : SkPath();
    if (evenodd) path.setFillType(SkPathFillType::kEvenOdd);
    return path;
}

void skia_canvas_fill_path(void* canvas, const void* path, int evenodd) { CANVAS_GPU_GUARD;
    auto* c = static_cast<Canvas*>(canvas); if (!c || !c->surface) return;
    draw_explicit_path(c, explicit_path(path, evenodd != 0), false, evenodd != 0);
}
void skia_canvas_stroke_path(void* canvas, const void* path) { CANVAS_GPU_GUARD;
    auto* c = static_cast<Canvas*>(canvas); if (!c || !c->surface) return;
    draw_explicit_path(c, explicit_path(path, false), true, false);
}
void skia_canvas_clip_path(void* canvas, const void* path, int evenodd) { CANVAS_GPU_GUARD;
    auto* c = static_cast<Canvas*>(canvas); if (!c || !c->surface) return;
    SkPath shape = explicit_path(path, evenodd != 0);
    shape.setIsVolatile(true);
    c->surface->getCanvas()->clipPath(shape, SkClipOp::kIntersect, true);
}
int skia_canvas_point_in_explicit_path(void* canvas, const void* path, float x, float y,
                                       int stroke, int evenodd) { CANVAS_GPU_GUARD;
    auto* c = static_cast<Canvas*>(canvas); if (!c || !c->surface) return 0;
    // Path2D coordinates are user space, but the hit point is in canvas space,
    // so the path is mapped through the current transform before the test. The
    // stroke outline is built first because the line width is in user space.
    const SkMatrix ctm = c->surface->getCanvas()->getTotalMatrix();
    SkPath shape = explicit_path(path, !stroke && evenodd);
    if (stroke) {
        SkPathBuilder outline;
        if (!skpathutils::FillPathWithPaint(shape, make_paint(c, c->stroke, true), &outline)) return 0;
        shape = outline.snapshot();
    }
    return shape.makeTransform(ctm).contains(x, y);
}
}
