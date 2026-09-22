use std::ffi::{c_char, c_void, CString};
use std::ptr;
use std::sync::OnceLock;
use std::rc::Rc;
use std::cell::RefCell;
#[path = "canvas_css.rs"]
mod canvas_css;

type NapiEnv = *mut c_void;
type NapiValue = *mut c_void;
type NapiCallbackInfo = *mut c_void;
type NapiCallback = unsafe extern "C" fn(NapiEnv, NapiCallbackInfo) -> NapiValue;
type NapiFinalize = unsafe extern "C" fn(NapiEnv, *mut c_void, *mut c_void);

#[repr(C)]
struct NapiTypeTag {
    lower: u64,
    upper: u64,
}

static GRADIENT_TYPE_TAG: NapiTypeTag = NapiTypeTag { lower: 0x2fa1_82b4_f902_4a31, upper: 0x8f17_a963_21cc_b101 };
static PATTERN_TYPE_TAG: NapiTypeTag = NapiTypeTag { lower: 0xbd19_60ca_7937_42c5, upper: 0xa71b_46f8_0e2d_9002 };
static PATH_TYPE_TAG: NapiTypeTag = NapiTypeTag { lower: 0x91c4_7f30_5ad2_4e61, upper: 0xb7e8_2c19_63fa_48d5 };
static HTML_CANVAS_HOST_TAG: NapiTypeTag = NapiTypeTag { lower: 0x9e6a_1e52_c034_4c82, upper: 0xb1ac_558e_e53b_7749 };
static OFFSCREEN_CANVAS_HOST_TAG: NapiTypeTag = NapiTypeTag { lower: 0x755b_0ff1_77ad_4a01, upper: 0x9c7e_e017_d4fb_5552 };
static HTML_CANVAS_2D_TYPE_TAG: NapiTypeTag = NapiTypeTag { lower: 0x67b9_76d2_e348_432a, upper: 0xb12a_a550_d405_1773 };
static CANVAS_2D_TYPE_TAG: NapiTypeTag = NapiTypeTag { lower: 0x7c42_825d_163a_4e61, upper: 0x8f2c_d940_ab13_916d };

#[link(name = "kernel32")]
extern "system" {
    fn GetModuleHandleW(name: *const u16) -> *mut c_void;
    fn GetProcAddress(module: *mut c_void, name: *const c_char) -> *mut c_void;
}

#[link(name = "skia_backend", kind = "static")]
extern "C" {
    fn skia_canvas_create(width: u32, height: u32, alpha: i32, color_space: i32, float16: i32) -> *mut c_void;
    fn skia_canvas_destroy(canvas: *mut c_void);
    fn skia_text_context_create(cache:*mut c_void)->*mut c_void;
    fn skia_canvas_set_font_options(canvas:*mut c_void,stretch:i32,caps:i32,rendering:i32);
    fn skia_canvas_set_image_quality(canvas:*mut c_void,quality:i32);
    fn skia_text_cache_create() -> *mut c_void;
    fn skia_text_cache_destroy(cache: *mut c_void);
    fn skia_canvas_set_text_cache(canvas: *mut c_void, cache: *mut c_void);
    fn skia_canvas_scale(canvas: *mut c_void, x: f32, y: f32);
    fn skia_canvas_translate(canvas: *mut c_void, x: f32, y: f32);
    fn skia_canvas_rotate(canvas: *mut c_void, radians: f64);
    fn skia_canvas_save(canvas: *mut c_void);
    fn skia_canvas_restore(canvas: *mut c_void, before: *const f64, after: *const f64);
    fn skia_canvas_set_transform(canvas: *mut c_void, a: f32, b: f32, c: f32, d: f32, e: f32, f: f32, before: *const f64);
    fn skia_canvas_transform(canvas: *mut c_void, a: f32, b: f32, c: f32, d: f32, e: f32, f: f32);
    fn skia_canvas_begin_path(canvas: *mut c_void);
    fn skia_canvas_move_to(canvas: *mut c_void, x: f32, y: f32);
    fn skia_canvas_line_to(canvas: *mut c_void, x: f32, y: f32);
    fn skia_canvas_quad_to(canvas: *mut c_void, x1: f32, y1: f32, x2: f32, y2: f32);
    fn skia_canvas_cubic_to(canvas: *mut c_void, x1: f32, y1: f32, x2: f32, y2: f32, x3: f32, y3: f32);
    fn skia_canvas_close_path(canvas: *mut c_void);
    fn skia_canvas_rect(canvas: *mut c_void, x: f32, y: f32, width: f32, height: f32);
    fn skia_canvas_round_rect(canvas: *mut c_void, x: f32, y: f32, width: f32, height: f32, radii: *const f32);
    fn skia_canvas_arc_to(canvas: *mut c_void, x1: f32, y1: f32, x2: f32, y2: f32, radius: f32);
    fn skia_canvas_arc(canvas: *mut c_void, x: f32, y: f32, radius: f32, start: f32, end: f32, ccw: i32);
    fn skia_canvas_ellipse(canvas: *mut c_void, cx: f32, cy: f32, rx: f32, ry: f32, rotation: f32, start: f32, end: f32, ccw: i32);
    fn skia_canvas_fill(canvas: *mut c_void, evenodd: i32);
    fn skia_canvas_stroke(canvas: *mut c_void);
    fn skia_canvas_fill_rect(canvas: *mut c_void, x: f32, y: f32, width: f32, height: f32);
    fn skia_canvas_clear_rect(canvas: *mut c_void, x: f32, y: f32, width: f32, height: f32);
    fn skia_canvas_stroke_rect(canvas: *mut c_void, x: f32, y: f32, width: f32, height: f32);
    fn skia_canvas_clip(canvas: *mut c_void, evenodd: i32);
    fn skia_canvas_point_in_path(canvas: *mut c_void, x: f32, y: f32, stroke: i32, evenodd: i32) -> i32;
    fn skia_canvas_set_color(canvas: *mut c_void, stroke: i32, r: u8, g: u8, b: u8, a: u8);
    fn skia_canvas_set_color_float(canvas: *mut c_void, stroke: i32, r: f32, g: f32, b: f32, a: f32);
    fn skia_canvas_set_gradient(canvas: *mut c_void, stroke: i32, kind: i32, args: *const f32, positions: *const f32, colors: *const f32, count: u32);
    fn skia_canvas_set_pattern(canvas: *mut c_void, stroke: i32, pixels: *const u8, width: u32, height: u32, repeat_x: i32, repeat_y: i32, matrix: *const f64, smoothing: i32, opaque: i32, color_space:i32, float16:i32);
    fn skia_canvas_set_shadow(canvas: *mut c_void, r: f32, g: f32, b: f32, a: f32, blur: f32, offset_x: f32, offset_y: f32);
    fn skia_canvas_set_line_width(canvas: *mut c_void, width: f32);
    fn skia_canvas_set_stroke_style(canvas: *mut c_void, cap: i32, join: i32, miter_limit: f32);
    fn skia_canvas_set_line_dash(canvas: *mut c_void, values: *const f32, count: u32, offset: f32);
    fn skia_canvas_set_global_alpha(canvas: *mut c_void, alpha: f32);
    fn skia_canvas_set_composite(canvas: *mut c_void, copy: i32);
    fn skia_canvas_spacing_unit(family:*const c_char,size:f32,weight:i32,slant:i32,ch:i32)->f32;
    fn skia_canvas_set_text_options(canvas:*mut c_void, letter:f32, word:f32, kern:i32, rtl:i32, slant:i32);
    fn skia_canvas_set_image_smoothing(canvas: *mut c_void, enabled: i32);
    fn skia_canvas_draw_text(canvas: *mut c_void, text: *const u8, length: u32, family: *const c_char, x: f32, y: f32, size: f32, stroke: i32, weight: i32, slant: i32, small_caps: i32, horizontal_scale: f32);
    fn skia_canvas_measure_text(canvas: *mut c_void, text: *const u8, length: u32, family: *const c_char, size: f32, weight: i32, slant: i32, small_caps: i32) -> f32;
    fn skia_canvas_text_bounds(canvas: *mut c_void, text: *const u8, length: u32, family: *const c_char, size: f32, weight: i32, slant: i32, bounds: *mut f32, small_caps: i32);
    fn skia_canvas_font_metrics(canvas: *mut c_void, family: *const c_char, size: f32, weight: i32, slant: i32, ascent: *mut f32, descent: *mut f32);
    fn skia_canvas_typo_metrics(canvas: *mut c_void, family: *const c_char, size: f32, weight: i32, slant: i32, ascent: *mut f32, descent: *mut f32);
    fn skia_canvas_reset(canvas: *mut c_void);
    fn skia_canvas_clear_bitmap(canvas: *mut c_void);
    fn skia_canvas_draw_rgba_image(canvas: *mut c_void, input: *const u8, image_width: u32, image_height: u32, image_opaque:i32, shadow_opaque:i32, color_space:i32, float16:i32,
                                   sx: f32, sy: f32, sw: f32, sh: f32, dx: f32, dy: f32, dw: f32, dh: f32);
    fn skia_canvas_read(canvas: *mut c_void, x: i32, y: i32, width: u32, height: u32, output: *mut u8, color_space: i32, float16: i32);
    fn skia_canvas_write(canvas: *mut c_void, input: *const u8, source_width: u32, source_height: u32, x: i32, y: i32, color_space:i32, float16:i32);
    fn skia_canvas_set_filter(canvas: *mut c_void, ops: *const f32, count: u32);
    fn skia_buffer_free(data: *mut u8);
    fn skia_encode_image(pixels: *const u8, width: u32, height: u32, format: i32, quality: f32, out_length: *mut usize) -> *mut u8;
    fn skia_render_diagnostics() -> *const c_char;
    fn skia_decode_image(data: *const u8, length: usize, out_width: *mut u32, out_height: *mut u32) -> *mut u8;
    fn skia_path_create() -> *mut c_void;
    fn skia_path_destroy(path: *mut c_void);
    fn skia_path_clone(path: *const c_void) -> *mut c_void;
    fn skia_path_from_svg(path: *mut c_void, text: *const c_char) -> i32;
    fn skia_path_move_to(path: *mut c_void, x: f32, y: f32);
    fn skia_path_line_to(path: *mut c_void, x: f32, y: f32);
    fn skia_path_quad_to(path: *mut c_void, x1: f32, y1: f32, x2: f32, y2: f32);
    fn skia_path_cubic_to(path: *mut c_void, x1: f32, y1: f32, x2: f32, y2: f32, x3: f32, y3: f32);
    fn skia_path_close(path: *mut c_void);
    fn skia_path_rect(path: *mut c_void, x: f32, y: f32, width: f32, height: f32);
    fn skia_path_round_rect(path: *mut c_void, x: f32, y: f32, width: f32, height: f32, radii: *const f32);
    fn skia_path_arc_to(path: *mut c_void, x1: f32, y1: f32, x2: f32, y2: f32, radius: f32);
    fn skia_path_arc(path: *mut c_void, x: f32, y: f32, radius: f32, start: f32, end: f32, ccw: i32);
    fn skia_path_ellipse(path: *mut c_void, cx: f32, cy: f32, rx: f32, ry: f32, rotation: f32, start: f32, end: f32, ccw: i32);
    fn skia_path_add_path(target: *mut c_void, source: *const c_void, matrix: *const f64);
    fn skia_canvas_fill_path(canvas: *mut c_void, path: *const c_void, evenodd: i32);
    fn skia_canvas_stroke_path(canvas: *mut c_void, path: *const c_void);
    fn skia_canvas_clip_path(canvas: *mut c_void, path: *const c_void, evenodd: i32);
    fn skia_canvas_point_in_explicit_path(canvas: *mut c_void, path: *const c_void, x: f32, y: f32, stroke: i32, evenodd: i32) -> i32;
}

struct Napi {
    create_reference: unsafe extern "C" fn(NapiEnv, NapiValue, u32, *mut *mut c_void) -> i32,
    get_reference_value: unsafe extern "C" fn(NapiEnv, *mut c_void, *mut NapiValue) -> i32,
    delete_reference: unsafe extern "C" fn(NapiEnv, *mut c_void) -> i32,
    coerce_to_number: unsafe extern "C" fn(NapiEnv, NapiValue, *mut NapiValue) -> i32,
    coerce_to_string: unsafe extern "C" fn(NapiEnv, NapiValue, *mut NapiValue) -> i32,
    coerce_to_bool: unsafe extern "C" fn(NapiEnv, NapiValue, *mut NapiValue) -> i32,
    get_value_bool: unsafe extern "C" fn(NapiEnv, NapiValue, *mut bool) -> i32,
    new_instance: unsafe extern "C" fn(NapiEnv, NapiValue, usize, *const NapiValue, *mut NapiValue) -> i32,
    call_function: unsafe extern "C" fn(NapiEnv, NapiValue, NapiValue, usize, *const NapiValue, *mut NapiValue) -> i32,
    #[cfg(feature = "bundled")]
    run_script: unsafe extern "C" fn(NapiEnv, NapiValue, *mut NapiValue) -> i32,
    get_new_target: unsafe extern "C" fn(NapiEnv, NapiCallbackInfo, *mut NapiValue) -> i32,
    throw: unsafe extern "C" fn(NapiEnv, NapiValue) -> i32,
    throw_type_error: unsafe extern "C" fn(NapiEnv, *const c_char, *const c_char) -> i32,
    create_object: unsafe extern "C" fn(NapiEnv, *mut NapiValue) -> i32,
    create_function: unsafe extern "C" fn(NapiEnv, *const c_char, usize, NapiCallback, *mut c_void, *mut NapiValue) -> i32,
    set_named_property: unsafe extern "C" fn(NapiEnv, NapiValue, *const c_char, NapiValue) -> i32,
    create_uint32: unsafe extern "C" fn(NapiEnv, u32, *mut NapiValue) -> i32,
    create_double: unsafe extern "C" fn(NapiEnv, f64, *mut NapiValue) -> i32,
    create_string_utf8: unsafe extern "C" fn(NapiEnv, *const c_char, usize, *mut NapiValue) -> i32,
    get_undefined: unsafe extern "C" fn(NapiEnv, *mut NapiValue) -> i32,
    get_boolean: unsafe extern "C" fn(NapiEnv, bool, *mut NapiValue) -> i32,
    get_cb_info: unsafe extern "C" fn(NapiEnv, NapiCallbackInfo, *mut usize, *mut NapiValue, *mut NapiValue, *mut *mut c_void) -> i32,
    get_value_string_utf8: unsafe extern "C" fn(NapiEnv, NapiValue, *mut c_char, usize, *mut usize) -> i32,
    get_value_uint32: unsafe extern "C" fn(NapiEnv, NapiValue, *mut u32) -> i32,
    get_value_double: unsafe extern "C" fn(NapiEnv, NapiValue, *mut f64) -> i32,
    type_of: unsafe extern "C" fn(NapiEnv, NapiValue, *mut i32) -> i32,
    create_array_with_length: unsafe extern "C" fn(NapiEnv, usize, *mut NapiValue) -> i32,
    get_array_length: unsafe extern "C" fn(NapiEnv, NapiValue, *mut u32) -> i32,
    get_element: unsafe extern "C" fn(NapiEnv, NapiValue, u32, *mut NapiValue) -> i32,
    set_element: unsafe extern "C" fn(NapiEnv, NapiValue, u32, NapiValue) -> i32,
    create_arraybuffer: unsafe extern "C" fn(NapiEnv, usize, *mut *mut c_void, *mut NapiValue) -> i32,
    create_typedarray: unsafe extern "C" fn(NapiEnv, i32, usize, NapiValue, usize, *mut NapiValue) -> i32,
    get_typedarray_info: unsafe extern "C" fn(NapiEnv, NapiValue, *mut i32, *mut usize, *mut *mut c_void, *mut NapiValue, *mut usize) -> i32,
    get_named_property: unsafe extern "C" fn(NapiEnv, NapiValue, *const c_char, *mut NapiValue) -> i32,
    define_properties: unsafe extern "C" fn(NapiEnv, NapiValue, usize, *const NapiPropertyDescriptor) -> i32,
    wrap: unsafe extern "C" fn(NapiEnv, NapiValue, *mut c_void, Option<NapiFinalize>, *mut c_void, *mut NapiValue) -> i32,
    unwrap: unsafe extern "C" fn(NapiEnv, NapiValue, *mut *mut c_void) -> i32,
    type_tag_object: unsafe extern "C" fn(NapiEnv, NapiValue, *const NapiTypeTag) -> i32,
    check_object_type_tag: unsafe extern "C" fn(NapiEnv, NapiValue, *const NapiTypeTag, *mut bool) -> i32,
    throw_range_error: unsafe extern "C" fn(NapiEnv, *const c_char, *const c_char) -> i32,
    get_global: unsafe extern "C" fn(NapiEnv, *mut NapiValue) -> i32,
}

static NAPI: OnceLock<Napi> = OnceLock::new();

unsafe fn symbol<T>(module: *mut c_void, name: &'static [u8]) -> T {
    let address = GetProcAddress(module, name.as_ptr() as *const c_char);
    assert!(!address.is_null(), "Node-API symbol is unavailable");
    std::mem::transmute_copy(&address)
}

unsafe fn load_napi() {
    NAPI.get_or_init(|| unsafe {
        let module = GetModuleHandleW(ptr::null());
        assert!(!module.is_null(), "cannot find the Node executable");
        Napi {
            create_reference: symbol(module, b"napi_create_reference\0"),
            get_reference_value: symbol(module, b"napi_get_reference_value\0"),
            delete_reference: symbol(module, b"napi_delete_reference\0"),
            coerce_to_number: symbol(module, b"napi_coerce_to_number\0"),
            coerce_to_string: symbol(module, b"napi_coerce_to_string\0"),
            coerce_to_bool: symbol(module, b"napi_coerce_to_bool\0"),
            get_value_bool: symbol(module, b"napi_get_value_bool\0"),
            new_instance: symbol(module, b"napi_new_instance\0"),
            call_function: symbol(module, b"napi_call_function\0"),
            #[cfg(feature = "bundled")]
            run_script: symbol(module, b"napi_run_script\0"),
            get_new_target: symbol(module, b"napi_get_new_target\0"),
            throw: symbol(module, b"napi_throw\0"),
            throw_type_error: symbol(module, b"napi_throw_type_error\0"),
            create_object: symbol(module, b"napi_create_object\0"),
            create_function: symbol(module, b"napi_create_function\0"),
            set_named_property: symbol(module, b"napi_set_named_property\0"),
            create_uint32: symbol(module, b"napi_create_uint32\0"),
            create_double: symbol(module, b"napi_create_double\0"),
            create_string_utf8: symbol(module, b"napi_create_string_utf8\0"),
            get_undefined: symbol(module, b"napi_get_undefined\0"),
            get_boolean: symbol(module, b"napi_get_boolean\0"),
            get_cb_info: symbol(module, b"napi_get_cb_info\0"),
            get_value_string_utf8: symbol(module, b"napi_get_value_string_utf8\0"),
            get_value_uint32: symbol(module, b"napi_get_value_uint32\0"),
            get_value_double: symbol(module, b"napi_get_value_double\0"),
            type_of: symbol(module, b"napi_typeof\0"),
            create_array_with_length: symbol(module, b"napi_create_array_with_length\0"),
            get_array_length: symbol(module, b"napi_get_array_length\0"),
            get_element: symbol(module, b"napi_get_element\0"),
            set_element: symbol(module, b"napi_set_element\0"),
            create_arraybuffer: symbol(module, b"napi_create_arraybuffer\0"),
            create_typedarray: symbol(module, b"napi_create_typedarray\0"),
            get_typedarray_info: symbol(module, b"napi_get_typedarray_info\0"),
            get_named_property: symbol(module, b"napi_get_named_property\0"),
            define_properties: symbol(module, b"napi_define_properties\0"),
            wrap: symbol(module, b"napi_wrap\0"),
            unwrap: symbol(module, b"napi_unwrap\0"),
            type_tag_object: symbol(module, b"napi_type_tag_object\0"),
            check_object_type_tag: symbol(module, b"napi_check_object_type_tag\0"),
            throw_range_error: symbol(module, b"napi_throw_range_error\0"),
            get_global: symbol(module, b"napi_get_global\0"),
        }
    });
}

#[repr(C)]
struct NapiPropertyDescriptor {
    utf8name: *const c_char,
    name: NapiValue,
    method: Option<NapiCallback>,
    getter: Option<NapiCallback>,
    setter: Option<NapiCallback>,
    value: NapiValue,
    attributes: u32,
    data: *mut c_void,
}

unsafe fn api() -> &'static Napi {
    NAPI.get().expect("Node-API must be initialized")
}

#[derive(Default)]
struct Context {
    version: u32,
    error: u32,
    clear_color: [f64; 4],
    viewport: [i32; 4],
    color: Vec<u8>,
    enabled: Vec<u32>,
}

// The text painter cache outlives resize/reset, like the Canvas context.
struct TextCache { native: *mut c_void, context: *mut c_void }
impl Drop for TextCache {
    fn drop(&mut self) {unsafe{skia_canvas_destroy(self.context);skia_text_cache_destroy(self.native);}}
}
// Distinct DOM and offscreen hosts share drawing primitives, not Web IDL brands.
#[derive(Clone, Copy, PartialEq)]
enum CanvasHost { Offscreen, Html }
const HTML_HOST_BIT: usize = 1 << 16;
impl CanvasHost {
    fn from_callback(data: usize) -> Self { if data & HTML_HOST_BIT != 0 { Self::Html } else { Self::Offscreen } }
    fn callback(self, index: usize) -> usize { index | if self==Self::Html {HTML_HOST_BIT} else {0} }
    fn tag(self) -> &'static NapiTypeTag { if self==Self::Html {&HTML_CANVAS_2D_TYPE_TAG} else {&CANVAS_2D_TYPE_TAG} }
}
struct Canvas2D {
    text_cache: Rc<TextCache>,
    native: *mut c_void,
    alpha: bool,
    desynchronized: bool,
    will_read_frequently: bool,
    context_lost: bool,
    color_space: bool,
    float16: bool,
    width: usize,
    height: usize,
    fill: Style,
    stroke: Style,
    shadow: Style,
    shadow_blur: f64,
    shadow_offset_x: f64,
    shadow_offset_y: f64,
    transform: [f64; 6],
    path: Vec<Path>,
    current_path: Option<usize>,
    line_width: f64,
    line_cap: String,
    line_join: String,
    miter_limit: f64,
    line_dash_offset: f64,
    global_alpha: f64,
    composite_mode: usize,
    image_smoothing: bool,
    image_quality: String,
    letter_spacing: String,
    word_spacing: String,
    letter_spacing_from_font: bool,
    word_spacing_from_font: bool,
    font_kerning: String,
    font_stretch: String,
    font_variant_caps: String,
    text_rendering: String,
    filter: String,
    lang: String,
    font: String,
    text_align: String,
    text_baseline: String,
    direction: String,
    line_dash: Vec<f64>,
    state_stack: Vec<CanvasState>,
}

#[derive(Clone)]
struct CanvasState {
    fill: Style,
    stroke: Style,
    shadow: Style,
    shadow_blur: f64,
    shadow_offset_x: f64,
    shadow_offset_y: f64,
    transform: [f64; 6],
    line_width: f64,
    line_cap: String,
    line_join: String,
    miter_limit: f64,
    line_dash_offset: f64,
    global_alpha: f64,
    composite_mode: usize,
    image_smoothing: bool,
    image_quality: String,
    letter_spacing: String,
    word_spacing: String,
    letter_spacing_from_font: bool,
    word_spacing_from_font: bool,
    font_kerning: String,
    font_stretch: String,
    font_variant_caps: String,
    text_rendering: String,
    filter: String,
    lang: String,
    font: String,
    text_align: String,
    text_baseline: String,
    direction: String,
    line_dash: Vec<f64>,
}

#[derive(Clone)]
enum Style {
    CssColor([u8; 4], f64, Option<[f32;4]>),
    Color([u8; 4]),
    Gradient(Rc<GradientStyle>),
    Pattern(Rc<PatternStyle>),
}

#[derive(Clone)]
struct Gradient {
    kind: u8,
    args: [f64; 6],
    stops: Vec<(f64, [u8; 4], [f32; 4])>,
}

#[derive(Clone)]
struct Path {
    points: Vec<(f64, f64)>,
    closed: bool,
}

struct GradientObject(Rc<RefCell<Gradient>>);

struct GradientStyle {
    data: Rc<RefCell<Gradient>>,
    env: NapiEnv,
    reference: *mut c_void,
}
impl Drop for GradientStyle {
    fn drop(&mut self) { unsafe { (api().delete_reference)(self.env, self.reference); } }
}

#[derive(Clone)]
struct Pattern { opaque: bool, color_space: bool, float16: bool, pixels: Vec<u8>, width: u32, height: u32, repeat_x: bool, repeat_y: bool, matrix: [f64;6] }
struct PatternObject(Rc<RefCell<Pattern>>);
struct PatternStyle {
    data: Rc<RefCell<Pattern>>,
    env: NapiEnv,
    reference: *mut c_void,
}
impl Drop for PatternStyle {
    fn drop(&mut self) { unsafe { (api().delete_reference)(self.env, self.reference); } }
}

unsafe extern "C" fn finalize_gradient(_: NapiEnv, data: *mut c_void, _: *mut c_void) {
    drop(Box::from_raw(data as *mut GradientObject));
}
unsafe extern "C" fn finalize_pattern(_: NapiEnv, data: *mut c_void, _: *mut c_void) {
    drop(Box::from_raw(data as *mut PatternObject));
}

// Path2D holds a native SkPath in user coordinates.
struct PathObject { native: *mut c_void }
impl Drop for PathObject {
    fn drop(&mut self) { unsafe { skia_path_destroy(self.native); } }
}
unsafe extern "C" fn finalize_path(_: NapiEnv, data: *mut c_void, _: *mut c_void) {
    drop(Box::from_raw(data as *mut PathObject));
}
unsafe fn path_from(env: NapiEnv, object: NapiValue) -> Option<*mut c_void> {
    let mut tagged = false;
    if (api().check_object_type_tag)(env, object, &PATH_TYPE_TAG, &mut tagged) != 0 || !tagged { return None; }
    let mut raw = ptr::null_mut();
    if (api().unwrap)(env, object, &mut raw) != 0 || raw.is_null() { return None; }
    Some((*(raw as *mut PathObject)).native)
}

unsafe extern "C" fn finalize_context(_: NapiEnv, data: *mut c_void, _: *mut c_void) {
    drop(Box::from_raw(data as *mut Context));
}

unsafe extern "C" fn finalize_canvas_2d(_: NapiEnv, data: *mut c_void, _: *mut c_void) {
    let canvas = Box::from_raw(data as *mut Canvas2D);
    if !canvas.native.is_null() { skia_canvas_destroy(canvas.native); }
}

unsafe fn undefined(env: NapiEnv) -> NapiValue {
    let mut value = ptr::null_mut();
    (api().get_undefined)(env, &mut value);
    value
}

unsafe fn boolean(env: NapiEnv, value: bool) -> NapiValue {
    let mut result = ptr::null_mut();
    (api().get_boolean)(env, value, &mut result);
    result
}

unsafe fn uint32(env: NapiEnv, value: u32) -> NapiValue {
    let mut result = ptr::null_mut();
    (api().create_uint32)(env, value, &mut result);
    result
}

unsafe fn string(env: NapiEnv, value: &str) -> NapiValue {
    let mut result = ptr::null_mut();
    (api().create_string_utf8)(env, value.as_ptr() as *const c_char, value.len(), &mut result);
    result
}

unsafe fn number(env: NapiEnv, value: NapiValue) -> f64 {
    let mut converted = ptr::null_mut();
    if (api().coerce_to_number)(env, value, &mut converted) != 0 { return f64::NAN; }
    let mut result = f64::NAN;
    (api().get_value_double)(env, converted, &mut result);
    result
}

unsafe fn dom_string(env:NapiEnv,value:NapiValue)->Option<String>{
    let mut converted=ptr::null_mut();
    if (api().coerce_to_string)(env,value,&mut converted)!=0{return None;}
    value_string(env,converted)
}

unsafe fn range_error(env: NapiEnv, message: &str) {
    let message = CString::new(message).unwrap();
    (api().throw_range_error)(env, ptr::null(), message.as_ptr());
}

unsafe fn type_error(env: NapiEnv, message: &str) -> NapiValue {
    let message = CString::new(message).unwrap();
    (api().throw_type_error)(env, ptr::null(), message.as_ptr());
    undefined(env)
}

unsafe fn dom_error(env: NapiEnv, name: &str, message: &str) -> NapiValue {
    let mut global = ptr::null_mut(); let mut constructor = ptr::null_mut(); let mut error = ptr::null_mut();
    (api().get_global)(env, &mut global);
    (api().get_named_property)(env, global, b"DOMException\0".as_ptr() as *const c_char, &mut constructor);
    let args = [string(env, message), string(env, name)];
    if (api().new_instance)(env, constructor, 2, args.as_ptr(), &mut error) == 0 { (api().throw)(env, error); }
    undefined(env)
}

unsafe fn webidl_long(env: NapiEnv, value: NapiValue) -> Option<i64> {
    let mut converted = ptr::null_mut();
    if (api().coerce_to_number)(env, value, &mut converted) != 0 { return None; }
    let n = number(env, converted);
    if !n.is_finite() || n.trunc() < i32::MIN as f64 || n.trunc() > i32::MAX as f64 {
        type_error(env, "Value is outside the range of a finite signed long");
        return None;
    }
    Some(n.trunc() as i64)
}

unsafe fn webidl_double(env: NapiEnv, value: NapiValue) -> Option<f64> {
    let mut converted = ptr::null_mut();
    if (api().coerce_to_number)(env, value, &mut converted) != 0 { return None; }
    let n = number(env, converted);
    if !n.is_finite() {
        type_error(env, "Value must be a finite double");
        return None;
    }
    Some(n)
}

unsafe fn truthy(env: NapiEnv, value: Option<&NapiValue>) -> bool {
    let Some(value) = value else { return false; };
    let mut converted = ptr::null_mut(); let mut result = false;
    if (api().coerce_to_bool)(env, *value, &mut converted) == 0 { (api().get_value_bool)(env, converted, &mut result); }
    result
}

unsafe fn context_option(env: NapiEnv, options: Option<NapiValue>, name: &str, fallback: bool) -> bool {
    let Some(options) = options else { return fallback; };
    let mut kind=0;(api().type_of)(env,options,&mut kind);
    if kind != 6 && kind != 7 { return fallback; }
    let mut value=ptr::null_mut();let name=CString::new(name).unwrap();
    if (api().get_named_property)(env,options,name.as_ptr(),&mut value)!=0 { return fallback; }
    (api().type_of)(env,value,&mut kind);
    if kind==0 { fallback } else { truthy(env,Some(&value)) }
}

unsafe fn radius_pair(env: NapiEnv, value: NapiValue) -> Option<[f64; 2]> {
    let mut value_type = 0i32;
    (api().type_of)(env, value, &mut value_type);
    let pair = if value_type == 6 {
        let x_name = CString::new("x").unwrap();
        let y_name = CString::new("y").unwrap();
        let mut x_value = ptr::null_mut();
        let mut y_value = ptr::null_mut();
        if (api().get_named_property)(env, value, x_name.as_ptr(), &mut x_value) != 0 ||
           (api().get_named_property)(env, value, y_name.as_ptr(), &mut y_value) != 0 {
            return None;
        }
        [number(env, x_value), number(env, y_value)]
    } else {
        let radius = number(env, value);
        [radius, radius]
    };
    if pair.iter().all(|component| component.is_finite() && *component >= 0.0) { Some(pair) } else { None }
}

unsafe fn round_rect_radii(env: NapiEnv, value: Option<NapiValue>, width: f64, height: f64) -> Option<[[f64; 2]; 4]> {
    let mut values = Vec::new();
    if let Some(value) = value {
        let mut length = 0u32;
        if (api().get_array_length)(env, value, &mut length) == 0 {
            if length == 0 || length > 4 {
                range_error(env, "Invalid roundRect radii");
                return None;
            }
            for index in 0..length {
                let mut item = ptr::null_mut();
                if (api().get_element)(env, value, index, &mut item) != 0 {
                    range_error(env, "Invalid roundRect radii");
                    return None;
                }
                values.push(item);
            }
        } else {
            values.push(value);
        }
    }

    let mut pairs = Vec::with_capacity(values.len().max(1));
    if values.is_empty() {
        pairs.push([0.0, 0.0]);
    } else {
        for value in values {
            let Some(pair) = radius_pair(env, value) else {
                range_error(env, "The radii must be finite and non-negative");
                return None;
            };
            pairs.push(pair);
        }
    }

    let mut radii = match pairs.len() {
        1 => [pairs[0], pairs[0], pairs[0], pairs[0]],
        2 => [pairs[0], pairs[1], pairs[0], pairs[1]],
        3 => [pairs[0], pairs[1], pairs[2], pairs[1]],
        4 => [pairs[0], pairs[1], pairs[2], pairs[3]],
        _ => unreachable!(),
    };

    if width < 0.0 {
        radii.swap(0, 1);
        radii.swap(2, 3);
    }
    if height < 0.0 {
        radii.swap(0, 3);
        radii.swap(1, 2);
    }

    let width = width.abs();
    let height = height.abs();
    let ratios = [
        (width, radii[0][0] + radii[1][0]),
        (width, radii[3][0] + radii[2][0]),
        (height, radii[0][1] + radii[3][1]),
        (height, radii[1][1] + radii[2][1]),
    ];
    let scale = ratios.iter().fold(1.0f64, |scale, (edge, sum)| {
        if *sum > 0.0 { scale.min(*edge / *sum) } else { scale }
    });
    for radius in &mut radii {
        radius[0] *= scale;
        radius[1] *= scale;
    }
    Some(radii)
}

unsafe fn value_string(env: NapiEnv, value: NapiValue) -> Option<String> {
    let mut length = 0usize;
    if (api().get_value_string_utf8)(env, value, ptr::null_mut(), 0, &mut length) != 0 {
        return None;
    }
    let mut buffer = vec![0i8; length + 1];
    if (api().get_value_string_utf8)(env, value, buffer.as_mut_ptr(), buffer.len(), &mut length) != 0 {
        return None;
    }
    Some(String::from_utf8_lossy(std::slice::from_raw_parts(buffer.as_ptr() as *const u8, length)).into_owned())
}

unsafe fn set(env: NapiEnv, object: NapiValue, name: &str, value: NapiValue) {
    let name = CString::new(name).unwrap();
    (api().set_named_property)(env, object, name.as_ptr(), value);
}

// Web IDL dictionary results define own data properties, bypassing inherited setters.
unsafe fn dictionary_set(env: NapiEnv, object: NapiValue, name: &str, value: NapiValue) {
    let name=CString::new(name).unwrap();
    let descriptor=NapiPropertyDescriptor{utf8name:name.as_ptr(),name:ptr::null_mut(),method:None,getter:None,setter:None,value,attributes:7,data:ptr::null_mut()};
    (api().define_properties)(env,object,1,&descriptor);
}

unsafe fn callback_info(env: NapiEnv, info: NapiCallbackInfo) -> (Vec<NapiValue>, NapiValue, usize) {
    let mut argc = 0usize;
    let mut this_arg = ptr::null_mut();
    let mut data = ptr::null_mut();
    (api().get_cb_info)(env, info, &mut argc, ptr::null_mut(), &mut this_arg, &mut data);
    let mut args = vec![ptr::null_mut(); argc];
    (api().get_cb_info)(env, info, &mut argc, args.as_mut_ptr(), &mut this_arg, &mut data);
    args.truncate(argc);
    (args, this_arg, data as usize)
}

unsafe fn context_from(env: NapiEnv, object: NapiValue) -> Option<&'static mut Context> {
    let mut raw = ptr::null_mut();
    if (api().unwrap)(env, object, &mut raw) != 0 || raw.is_null() {
        return None;
    }
    Some(&mut *(raw as *mut Context))
}

unsafe fn canvas_2d_from(env: NapiEnv, object: NapiValue, host: CanvasHost) -> Option<&'static mut Canvas2D> {
    let mut tagged=false;
    if (api().check_object_type_tag)(env,object,host.tag(),&mut tagged)!=0 || !tagged { return None; }
    let mut raw = ptr::null_mut();
    if (api().unwrap)(env, object, &mut raw) != 0 || raw.is_null() {
        return None;
    }
    Some(&mut *(raw as *mut Canvas2D))
}

unsafe fn clamped_pixels(env: NapiEnv, pixels: &[u8]) -> NapiValue {
    let mut data = ptr::null_mut();
    let mut array_buffer = ptr::null_mut();
    (api().create_arraybuffer)(env, pixels.len(), &mut data, &mut array_buffer);
    if !data.is_null() && !pixels.is_empty() {
        ptr::copy_nonoverlapping(pixels.as_ptr(), data as *mut u8, pixels.len());
    }
    let mut array = ptr::null_mut();
    // napi_uint8_clamped_array is 2 in the Node-API ABI.
    (api().create_typedarray)(env, 2, pixels.len(), array_buffer, 0, &mut array);
    array
}

unsafe fn image_data(env: NapiEnv, width: usize, height: usize, pixels: &[u8], color_space: bool, float16: bool) -> NapiValue {
    let mut result = ptr::null_mut();
    (api().create_object)(env, &mut result);
    let props=[(b"data\0".as_slice(),clamped_pixels(env,pixels)),(b"width\0".as_slice(),uint32(env,width as u32)),(b"height\0".as_slice(),uint32(env,height as u32)),(b"colorSpace\0".as_slice(),string(env,if color_space{"display-p3"}else{"srgb"})),(b"pixelFormat\0".as_slice(),string(env,if float16{"rgba-float16"}else{"rgba-unorm8"}))];
    let descriptors:Vec<NapiPropertyDescriptor>=props.iter().map(|(name,value)|NapiPropertyDescriptor{
        utf8name:name.as_ptr() as *const c_char,name:ptr::null_mut(),method:None,getter:None,setter:None,value:*value,attributes:2,data:ptr::null_mut()
    }).collect();
    (api().define_properties)(env,result,descriptors.len(),descriptors.as_ptr());
    result
}

fn parse_color(value: &str) -> Option<[u8; 4]> {
    let value = value.trim().to_ascii_lowercase();
    let function=canvas_css::preprocess(&value);
    let function=function.trim();
    if function.starts_with("hsl") || function.starts_with("rgb(")||function.starts_with("rgba(") {
        return canvas_css::function_color(function);
    }
    let named = canvas_css::named_color(&value);
    if named.is_some() { return named; }
    let hex = value.strip_prefix('#')?;
    // Validate bytes before slicing UTF-8: malformed CSS must never panic.
    if !hex.bytes().all(|byte| byte.is_ascii_hexdigit()) { return None; }
    let byte = |index: usize| u8::from_str_radix(&hex[index..index + 2], 16).ok();
    match hex.len() {
        3 => Some([
            u8::from_str_radix(&hex[0..1].repeat(2), 16).ok()?,
            u8::from_str_radix(&hex[1..2].repeat(2), 16).ok()?,
            u8::from_str_radix(&hex[2..3].repeat(2), 16).ok()?, 255,
        ]),
        4 => Some([
            u8::from_str_radix(&hex[0..1].repeat(2), 16).ok()?,
            u8::from_str_radix(&hex[1..2].repeat(2), 16).ok()?,
            u8::from_str_radix(&hex[2..3].repeat(2), 16).ok()?,
            u8::from_str_radix(&hex[3..4].repeat(2), 16).ok()?,
        ]),
        6 => Some([byte(0)?, byte(2)?, byte(4)?, 255]),
        8 => Some([byte(0)?, byte(2)?, byte(4)?, byte(6)?]),
        _ => None,
    }
}

const CONSTANTS: &[(&str, u32)] = &[
    ("DEPTH_BUFFER_BIT", 0x0100), ("STENCIL_BUFFER_BIT", 0x0400), ("COLOR_BUFFER_BIT", 0x4000),
    ("POINTS", 0), ("LINES", 1), ("LINE_LOOP", 2), ("LINE_STRIP", 3), ("TRIANGLES", 4),
    ("TRIANGLE_STRIP", 5), ("TRIANGLE_FAN", 6), ("ARRAY_BUFFER", 0x8892),
    ("ELEMENT_ARRAY_BUFFER", 0x8893), ("STATIC_DRAW", 0x88E4), ("DYNAMIC_DRAW", 0x88E8),
    ("STREAM_DRAW", 0x88E0), ("BUFFER_SIZE", 0x8764), ("BUFFER_USAGE", 0x8765),
    ("NO_ERROR", 0), ("INVALID_ENUM", 0x0500), ("INVALID_VALUE", 0x0501),
    ("INVALID_OPERATION", 0x0502), ("OUT_OF_MEMORY", 0x0505), ("INVALID_FRAMEBUFFER_OPERATION", 0x0506),
    ("VERTEX_SHADER", 0x8B31), ("FRAGMENT_SHADER", 0x8B30), ("COMPILE_STATUS", 0x8B81),
    ("LINK_STATUS", 0x8B82), ("VALIDATE_STATUS", 0x8B83), ("COLOR_BUFFER_BIT", 0x4000),
    ("TEXTURE_2D", 0x0DE1), ("TEXTURE_3D", 0x806F), ("TEXTURE_CUBE_MAP", 0x8513),
    ("TEXTURE0", 0x84C0), ("TEXTURE1", 0x84C1), ("TEXTURE31", 0x84DF),
    ("RGBA", 0x1908), ("RGB", 0x1907), ("UNSIGNED_BYTE", 0x1401), ("FLOAT", 0x1406),
    ("FRAMEBUFFER", 0x8D40), ("RENDERBUFFER", 0x8D41), ("FRAMEBUFFER_COMPLETE", 0x8CD5),
    ("VERSION", 0x1F02), ("VENDOR", 0x1F00), ("RENDERER", 0x1F01),
    ("SHADING_LANGUAGE_VERSION", 0x8B8C), ("MAX_TEXTURE_SIZE", 0x0D33),
    ("MAX_VERTEX_ATTRIBS", 0x8869), ("MAX_DRAW_BUFFERS", 0x8824), ("DRAW_BUFFER0", 0x8825),
    ("READ_FRAMEBUFFER", 0x8CA8), ("DRAW_FRAMEBUFFER", 0x8CA9), ("UNIFORM_BUFFER", 0x8A11),
    ("COPY_READ_BUFFER", 0x8F36), ("COPY_WRITE_BUFFER", 0x8F37), ("SYNC_FENCE", 0x9116),
    ("TIMEOUT_IGNORED", u32::MAX), ("INVALID_INDEX", u32::MAX),
];

const METHODS: &[&str] = &[
    "activeTexture", "attachShader", "beginQuery", "beginTransformFeedback", "bindAttribLocation",
    "bindBuffer", "bindBufferBase", "bindBufferRange", "bindFramebuffer", "bindRenderbuffer",
    "bindSampler", "bindTexture", "bindTransformFeedback", "bindVertexArray", "blendColor",
    "blendEquation", "blendEquationSeparate", "blendFunc", "blendFuncSeparate", "blitFramebuffer",
    "bufferData", "bufferSubData", "checkFramebufferStatus", "clear", "clearBufferfi", "clearBufferfv",
    "clearBufferiv", "clearBufferuiv", "clearColor", "clearDepth", "clearStencil", "clientWaitSync",
    "colorMask", "compileShader", "compressedTexImage2D", "compressedTexImage3D", "compressedTexSubImage2D",
    "compressedTexSubImage3D", "copyBufferSubData", "copyTexImage2D", "copyTexSubImage2D", "copyTexSubImage3D",
    "createBuffer", "createFramebuffer", "createProgram", "createQuery", "createRenderbuffer", "createSampler",
    "createShader", "createTexture", "createTransformFeedback", "createVertexArray", "cullFace", "deleteBuffer",
    "deleteFramebuffer", "deleteProgram", "deleteQuery", "deleteRenderbuffer", "deleteSampler", "deleteShader",
    "deleteSync", "deleteTexture", "deleteTransformFeedback", "deleteVertexArray", "depthFunc", "depthMask",
    "depthRange", "detachShader", "disable", "disableVertexAttribArray", "drawArrays", "drawArraysInstanced",
    "drawBuffers", "drawElements", "drawElementsInstanced", "drawRangeElements", "drawingBufferStorage",
    "enable", "enableVertexAttribArray", "endQuery", "endTransformFeedback", "fenceSync", "finish", "flush",
    "framebufferRenderbuffer", "framebufferTexture2D", "framebufferTextureLayer", "frontFace", "generateMipmap",
    "getActiveAttrib", "getActiveUniform", "getActiveUniformBlockName", "getActiveUniformBlockParameter",
    "getActiveUniforms", "getAttachedShaders", "getAttribLocation", "getBufferParameter", "getBufferSubData",
    "getContextAttributes", "getError", "getExtension", "getFragDataLocation", "getFramebufferAttachmentParameter",
    "getIndexedParameter", "getInternalformatParameter", "getParameter", "getProgramInfoLog", "getProgramParameter",
    "getQuery", "getQueryParameter", "getRenderbufferParameter", "getSamplerParameter", "getShaderInfoLog",
    "getShaderParameter", "getShaderPrecisionFormat", "getShaderSource", "getSupportedExtensions", "getSyncParameter",
    "getTexParameter", "getTransformFeedbackVarying", "getUniform", "getUniformBlockIndex", "getUniformIndices",
    "getUniformLocation", "getVertexAttrib", "getVertexAttribOffset", "hint", "invalidateFramebuffer",
    "invalidateSubFramebuffer", "isBuffer", "isContextLost", "isEnabled", "isFramebuffer", "isProgram", "isQuery",
    "isRenderbuffer", "isSampler", "isShader", "isSync", "isTexture", "isTransformFeedback", "isVertexArray",
    "lineWidth", "linkProgram", "makeXRCompatible", "pauseTransformFeedback", "pixelStorei", "polygonOffset",
    "readBuffer", "readPixels", "renderbufferStorage", "renderbufferStorageMultisample", "resumeTransformFeedback",
    "sampleCoverage", "samplerParameterf", "samplerParameteri", "scissor", "shaderSource", "stencilFunc",
    "stencilFuncSeparate", "stencilMask", "stencilMaskSeparate", "stencilOp", "stencilOpSeparate", "texImage2D",
    "texImage3D", "texParameterf", "texParameteri", "texStorage2D", "texStorage3D", "texSubImage2D", "texSubImage3D",
    "transformFeedbackVaryings", "uniform1f", "uniform1fv", "uniform1i", "uniform1iv", "uniform1ui", "uniform1uiv",
    "uniform2f", "uniform2fv", "uniform2i", "uniform2iv", "uniform2ui", "uniform2uiv", "uniform3f", "uniform3fv",
    "uniform3i", "uniform3iv", "uniform3ui", "uniform3uiv", "uniform4f", "uniform4fv", "uniform4i", "uniform4iv",
    "uniform4ui", "uniform4uiv", "uniformBlockBinding", "uniformMatrix2fv", "uniformMatrix2x3fv", "uniformMatrix2x4fv",
    "uniformMatrix3fv", "uniformMatrix3x2fv", "uniformMatrix3x4fv", "uniformMatrix4fv", "uniformMatrix4x2fv",
    "uniformMatrix4x3fv", "useProgram", "validateProgram", "vertexAttrib1f", "vertexAttrib1fv", "vertexAttrib2f",
    "vertexAttrib2fv", "vertexAttrib3f", "vertexAttrib3fv", "vertexAttrib4f", "vertexAttrib4fv", "vertexAttribDivisor",
    "vertexAttribI4i", "vertexAttribI4iv", "vertexAttribI4ui", "vertexAttribI4uiv", "vertexAttribIPointer",
    "vertexAttribPointer", "viewport", "waitSync",
];

const WEBGL1_METHODS: &[&str] = &[
    "activeTexture", "attachShader", "bindAttribLocation", "bindBuffer", "bindFramebuffer",
    "bindRenderbuffer", "bindTexture", "blendColor", "blendEquation", "blendEquationSeparate",
    "blendFunc", "blendFuncSeparate", "bufferData", "bufferSubData", "checkFramebufferStatus",
    "clear", "clearColor", "clearDepth", "clearStencil", "colorMask", "compileShader",
    "compressedTexImage2D", "compressedTexSubImage2D", "copyTexImage2D", "copyTexSubImage2D",
    "createBuffer", "createFramebuffer", "createProgram", "createRenderbuffer", "createShader",
    "createTexture", "cullFace", "deleteBuffer", "deleteFramebuffer", "deleteProgram",
    "deleteRenderbuffer", "deleteShader", "deleteTexture", "depthFunc", "depthMask", "depthRange",
    "detachShader", "disable", "disableVertexAttribArray", "drawArrays", "drawElements",
    "drawingBufferStorage", "enable", "enableVertexAttribArray", "finish", "flush",
    "framebufferRenderbuffer", "framebufferTexture2D", "frontFace", "generateMipmap",
    "getActiveAttrib", "getActiveUniform", "getAttachedShaders", "getAttribLocation",
    "getBufferParameter", "getContextAttributes", "getError", "getExtension",
    "getFramebufferAttachmentParameter", "getParameter", "getProgramInfoLog", "getProgramParameter",
    "getRenderbufferParameter", "getShaderInfoLog", "getShaderParameter", "getShaderPrecisionFormat",
    "getShaderSource", "getSupportedExtensions", "getTexParameter", "getUniform",
    "getUniformLocation", "getVertexAttrib", "getVertexAttribOffset", "hint", "isBuffer",
    "isContextLost", "isEnabled", "isFramebuffer", "isProgram", "isRenderbuffer", "isShader",
    "isTexture", "lineWidth", "linkProgram", "makeXRCompatible", "pixelStorei", "polygonOffset",
    "readPixels", "renderbufferStorage", "sampleCoverage", "scissor", "shaderSource", "stencilFunc",
    "stencilFuncSeparate", "stencilMask", "stencilMaskSeparate", "stencilOp", "stencilOpSeparate",
    "texImage2D", "texParameterf", "texParameteri", "texSubImage2D", "uniform1f", "uniform1fv",
    "uniform1i", "uniform1iv", "uniform2f", "uniform2fv", "uniform2i", "uniform2iv", "uniform3f",
    "uniform3fv", "uniform3i", "uniform3iv", "uniform4f", "uniform4fv", "uniform4i", "uniform4iv",
    "uniformMatrix2fv", "uniformMatrix3fv", "uniformMatrix4fv", "useProgram", "validateProgram",
    "vertexAttrib1f", "vertexAttrib1fv", "vertexAttrib2f", "vertexAttrib2fv", "vertexAttrib3f",
    "vertexAttrib3fv", "vertexAttrib4f", "vertexAttrib4fv", "vertexAttribPointer", "viewport",
];

const WEBGL_OBJECT_TYPES: &[&str] = &[
    "WebGLBuffer", "WebGLFramebuffer", "WebGLProgram", "WebGLQuery", "WebGLRenderbuffer",
    "WebGLSampler", "WebGLShader", "WebGLSync", "WebGLTexture", "WebGLTransformFeedback",
    "WebGLUniformLocation", "WebGLVertexArrayObject", "WebGLActiveInfo", "WebGLShaderPrecisionFormat",
];

const CANVAS_2D_METHODS: &[&str] = &[
    "_resize", "_clearBitmap", "_ensureBitmap",
    "_fillPath", "_strokePath", "_clipPath", "_pointInPath",
    "arc", "arcTo", "beginPath", "bezierCurveTo", "clearRect", "clip", "closePath",
    "createConicGradient", "createImageData", "createLinearGradient", "createPattern",
    "createRadialGradient", "drawImage", "ellipse", "fill", "fillRect", "fillText",
    "getContextAttributes", "getImageData", "getLineDash", "getTransform", "isContextLost",
    "isPointInPath", "isPointInStroke", "lineTo", "measureText", "moveTo", "putImageData",
    "quadraticCurveTo", "rect", "reset", "resetTransform", "restore", "rotate", "roundRect",
    "save", "scale", "setLineDash", "setTransform", "stroke", "strokeRect", "strokeText",
    "transform", "translate",
];

const COMPOSITE_MODES: [&str;29] = ["", "copy", "", "source-over", "destination-over", "source-in", "destination-in", "source-out", "destination-out", "source-atop", "destination-atop", "xor", "lighter", "", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion", "multiply", "hue", "saturation", "color", "luminosity"];

unsafe fn string_option(env:NapiEnv, options:Option<NapiValue>, name:&str, default:&str)->String {
    let Some(options)=options else{return default.into();};
    let mut value=ptr::null_mut();let name=CString::new(name).unwrap();
    if (api().get_named_property)(env,options,name.as_ptr(),&mut value)!=0{return default.into();}
    value_string(env,value).unwrap_or_else(||default.into())
}

unsafe fn canvas_2d(width: usize, height: usize, env: NapiEnv, host: CanvasHost, alpha: bool, desynchronized: bool, will_read_frequently: bool, color_space: bool, float16: bool) -> NapiValue {
    let mut object = ptr::null_mut();
    (api().create_object)(env, &mut object);
    let cache=skia_text_cache_create();
    let text_cache=Rc::new(TextCache{native:cache,context:skia_text_context_create(cache)});
    let native=skia_canvas_create(width.min(u32::MAX as usize) as u32,height.min(u32::MAX as usize) as u32,alpha as i32,color_space as i32,float16 as i32);
    skia_canvas_set_text_cache(native,text_cache.native);
    let data = Box::new(Canvas2D {
        native, text_cache,
        alpha, desynchronized, will_read_frequently, context_lost:false, color_space, float16,
        width, height, fill: Style::Color([0, 0, 0, 255]),
        stroke: Style::Color([0, 0, 0, 255]), shadow: Style::Color([0, 0, 0, 0]), shadow_blur: 0.0, shadow_offset_x: 0.0, shadow_offset_y: 0.0,
        transform: [1.0, 0.0, 0.0, 1.0, 0.0, 0.0], path: Vec::new(), current_path: None,
        line_width: 1.0, line_cap: "butt".to_string(), line_join: "miter".to_string(), miter_limit: 10.0, line_dash_offset: 0.0, global_alpha: 1.0, composite_mode: 3, image_smoothing: true, image_quality:"low".into(), letter_spacing:"0px".into(), word_spacing:"0px".into(), letter_spacing_from_font:false,word_spacing_from_font:false, font_kerning:"auto".into(),font_stretch:"normal".into(),font_variant_caps:"normal".into(),text_rendering:"auto".into(),filter:"none".into(),lang:"inherit".into(),
        font: "10px sans-serif".to_string(), text_align: "start".to_string(),
        text_baseline: "alphabetic".to_string(), direction: "inherit".to_string(), line_dash: Vec::new(),
        state_stack: Vec::new(),
    });
    (api().wrap)(env, object, Box::into_raw(data) as *mut c_void, Some(finalize_canvas_2d), ptr::null_mut(), ptr::null_mut());
    (api().type_tag_object)(env,object,host.tag());
    for (index, name) in CANVAS_2D_METHODS.iter().enumerate() {
        let mut function = ptr::null_mut();
        let name_c = CString::new(*name).unwrap();
        (api().create_function)(env, name_c.as_ptr(), name.len(), canvas_2d_method, host.callback(index) as *mut c_void, &mut function);
        set(env, object, name, function);
    }
    let props = [
        ("fillStyle", 0usize), ("strokeStyle", 1), ("shadowColor", 2), ("shadowBlur", 3), ("shadowOffsetX", 10), ("shadowOffsetY", 11),
        ("lineWidth", 4), ("globalAlpha", 5), ("font", 6), ("textAlign", 7),
        ("textBaseline", 8), ("globalCompositeOperation", 9), ("imageSmoothingEnabled", 16), ("lineCap", 12), ("lineJoin", 13), ("miterLimit", 14), ("lineDashOffset", 15),
        ("direction", 17), ("letterSpacing",18), ("wordSpacing",19), ("fontKerning",20), ("imageSmoothingQuality",21), ("fontStretch",22), ("fontVariantCaps",23), ("textRendering",24), ("filter",25), ("lang",26),
    ];
    // The descriptor names must outlive define_properties but not the call:
    // into_raw() here would leak one CString per property for every context.
    let names: Vec<CString> = props.iter().map(|(name, _)| CString::new(*name).unwrap()).collect();
    // napi_configurable lets the JavaScript wrapper move these accessors onto
    // the interface prototype, where Chrome exposes them.
    let descriptors: Vec<NapiPropertyDescriptor> = props.iter().zip(names.iter()).map(|((_, index), name)| NapiPropertyDescriptor {
        utf8name: name.as_ptr(), name: ptr::null_mut(), method: None,
        getter: Some(get_canvas_property), setter: Some(set_canvas_property), value: ptr::null_mut(),
        attributes: 4, data: host.callback(*index) as *mut c_void,
    }).collect();
    (api().define_properties)(env, object, descriptors.len(), descriptors.as_ptr());
    drop(names);
    object
}

fn floor(value: f64) -> isize { value.floor() as isize }

fn style_color(style: &Style) -> [u8; 4] { match style { Style::Color(c) | Style::CssColor(c,_,_) => *c, Style::Gradient(g) => g.data.borrow().stops.first().map(|s| s.1).unwrap_or([0,0,0,255]), Style::Pattern(_) => [0,0,0,255] } }

fn css_style(value: &str, color: [u8;4]) -> Style {
    let floats=canvas_css::hsl_color(value);
    if let Some(alpha)=canvas_css::alpha(value).or_else(||floats.map(|c|c[3] as f64)) {
        Style::CssColor(color,alpha,floats)
    } else { Style::Color(color) }
}
fn drawing_color(style: &Style) -> [f32;4] {
    if let Style::CssColor(_,_,Some(color))=style { *color }
    else { style_color(style).map(|v|v as f32/255.0) }
}

unsafe fn style_value(env: NapiEnv, style: &Style) -> NapiValue {
    if let Style::Gradient(g) = style {
        let mut value = ptr::null_mut();
        (api().get_reference_value)(env, g.reference, &mut value);
        return value;
    }
    if let Style::Pattern(p) = style {
        let mut value = ptr::null_mut();
        (api().get_reference_value)(env, p.reference, &mut value);
        return value;
    }
    let color = style_color(style);
    if let Style::CssColor(_,alpha,_)=style {
        let byte=(*alpha*255.0).round() as u8;
        if byte<255{return string(env,&format!("rgba({}, {}, {}, {})",color[0],color[1],color[2],canvas_css::serialized_alpha(byte)));}
        return string(env,&format!("#{:02x}{:02x}{:02x}",color[0],color[1],color[2]));
    }
    if color[3] == 255 { string(env, &format!("#{:02x}{:02x}{:02x}", color[0], color[1], color[2])) }
    else { string(env, &format!("rgba({}, {}, {}, {})", color[0], color[1], color[2], canvas_css::serialized_alpha(color[3]))) }
}

// The JS-facing object and argument conversion remain in Rust.  Pixel generation is delegated
// to the linked Skia surface through this small C ABI boundary.
unsafe fn sync_native_style(canvas: &Canvas2D, style: &Style, stroke: bool) {
    if canvas.native.is_null() { return; }
    match style {
        Style::CssColor(_,_,Some(color)) => skia_canvas_set_color_float(canvas.native, stroke as i32, color[0], color[1], color[2], color[3]),
        Style::Color(color) | Style::CssColor(color,_,None) => skia_canvas_set_color(canvas.native, stroke as i32, color[0], color[1], color[2], color[3]),
        Style::Gradient(gradient) => {
            let gradient = gradient.data.borrow();
            let args = gradient.args.map(|value| value as f32);
            let positions: Vec<f32> = gradient.stops.iter().map(|(position, _, _)| *position as f32).collect();
            let mut colors = Vec::with_capacity(gradient.stops.len() * 4);
            for (_, _, color) in &gradient.stops { colors.extend_from_slice(color); }
            skia_canvas_set_gradient(canvas.native, stroke as i32, gradient.kind as i32, args.as_ptr(),
                                     positions.as_ptr(), colors.as_ptr(), gradient.stops.len() as u32);
        },
        Style::Pattern(pattern) => {
            let pattern=pattern.data.borrow();
            skia_canvas_set_pattern(canvas.native, stroke as i32, pattern.pixels.as_ptr(), pattern.width, pattern.height, pattern.repeat_x as i32, pattern.repeat_y as i32, pattern.matrix.as_ptr(), canvas.image_smoothing as i32, pattern.opaque as i32,pattern.color_space as i32,pattern.float16 as i32);
        },
    }
}

// ctx.filter accepts "none" or a CSS <filter-function-list>. Each function is
// encoded as eight floats for the Skia side: kind, three parameters, RGBA.
// CSS keywords, function names and units are ASCII case-insensitive.
fn strip_unit<'a>(text: &'a str, unit: &str) -> Option<&'a str> {
    if text.len() < unit.len() { return None; }
    let (head, tail) = text.split_at(text.len() - unit.len());
    if tail.eq_ignore_ascii_case(unit) { Some(head) } else { None }
}
fn filter_amount(text: &str, default_percent: bool) -> Option<f32> {
    let text = text.trim();
    if text.is_empty() { return if default_percent { Some(1.0) } else { None }; }
    if let Some(number) = text.strip_suffix('%') {
        return number.trim().parse::<f32>().ok().map(|v| v / 100.0);
    }
    text.parse::<f32>().ok()
}
fn filter_angle(text: &str) -> Option<f32> {
    let text = text.trim();
    if text.is_empty() { return Some(0.0); }
    for (suffix, scale) in [("deg", 1.0), ("grad", 0.9), ("rad", 180.0 / std::f32::consts::PI), ("turn", 360.0)] {
        if let Some(number) = strip_unit(text, suffix) {
            return number.trim().parse::<f32>().ok().map(|v| v * scale);
        }
    }
    if text.parse::<f32>().ok() == Some(0.0) { return Some(0.0); }
    None
}
fn filter_length(text: &str) -> Option<f32> {
    let text = text.trim();
    if let Some(number) = strip_unit(text, "px") { return number.trim().parse::<f32>().ok(); }
    if text.parse::<f32>().ok() == Some(0.0) { return Some(0.0); }
    None
}
// blur() and the amount functions accept an empty argument list.
fn filter_length_or_zero(text: &str) -> Option<f32> {
    if text.trim().is_empty() { Some(0.0) } else { filter_length(text) }
}
fn parse_filter(value: &str) -> Option<Vec<f32>> {
    let text = value.trim();
    if text.is_empty() { return None; }
    if text.eq_ignore_ascii_case("none") { return Some(Vec::new()); }
    let mut ops: Vec<f32> = Vec::new();
    let mut rest = text;
    while !rest.trim_start().is_empty() {
        rest = rest.trim_start();
        let open = rest.find('(')?;
        let close = rest.find(')')?;
        if close < open { return None; }
        let name = rest[..open].trim().to_ascii_lowercase();
        let argument = &rest[open + 1..close];
        rest = &rest[close + 1..];
        let mut op = [0.0f32; 8];
        match name.as_str() {
            "blur" => { op[0] = 1.0; op[1] = filter_length_or_zero(argument)?; if op[1] < 0.0 { return None; } }
            "brightness" => { op[0] = 2.0; op[1] = filter_amount(argument, true)?; if op[1] < 0.0 { return None; } }
            "contrast" => { op[0] = 3.0; op[1] = filter_amount(argument, true)?; if op[1] < 0.0 { return None; } }
            "grayscale" => { op[0] = 4.0; op[1] = filter_amount(argument, true)?; if op[1] < 0.0 { return None; } }
            "hue-rotate" => { op[0] = 5.0; op[1] = filter_angle(argument)?; }
            "invert" => { op[0] = 6.0; op[1] = filter_amount(argument, true)?; if op[1] < 0.0 { return None; } }
            "opacity" => { op[0] = 7.0; op[1] = filter_amount(argument, true)?; if op[1] < 0.0 { return None; } }
            "saturate" => { op[0] = 8.0; op[1] = filter_amount(argument, true)?; if op[1] < 0.0 { return None; } }
            "sepia" => { op[0] = 9.0; op[1] = filter_amount(argument, true)?; if op[1] < 0.0 { return None; } }
            "drop-shadow" => {
                op[0] = 10.0;
                // <offset-x> <offset-y> <blur>? <color>?  in any colour position
                let mut lengths: Vec<f32> = Vec::new();
                let mut colour: Option<[u8; 4]> = None;
                let mut token = String::new();
                let mut depth = 0i32;
                let push = |token: &mut String, lengths: &mut Vec<f32>, colour: &mut Option<[u8; 4]>| -> bool {
                    let piece = token.trim().to_string();
                    token.clear();
                    if piece.is_empty() { return true; }
                    if let Some(length) = filter_length(&piece) { lengths.push(length); return true; }
                    if let Some(parsed) = parse_color(&piece) { *colour = Some(parsed); return true; }
                    false
                };
                for ch in argument.chars() {
                    match ch {
                        '(' => { depth += 1; token.push(ch); }
                        ')' => { depth -= 1; token.push(ch); }
                        c if c.is_whitespace() && depth == 0 => {
                            if !push(&mut token, &mut lengths, &mut colour) { return None; }
                        }
                        _ => token.push(ch),
                    }
                }
                if !push(&mut token, &mut lengths, &mut colour) { return None; }
                if lengths.len() < 2 || lengths.len() > 3 { return None; }
                if lengths.len() == 3 && lengths[2] < 0.0 { return None; }
                op[1] = lengths[0]; op[2] = lengths[1];
                op[3] = *lengths.get(2).unwrap_or(&0.0);
                let colour = colour.unwrap_or([0, 0, 0, 255]);
                op[4] = colour[0] as f32 / 255.0; op[5] = colour[1] as f32 / 255.0;
                op[6] = colour[2] as f32 / 255.0; op[7] = colour[3] as f32 / 255.0;
            }
            "url" => { if argument.trim().is_empty() { return None; } continue; }
            _ => return None,
        }
        if !op.iter().all(|v| v.is_finite()) { return None; }
        ops.extend_from_slice(&op);
    }
    Some(ops)
}

unsafe fn sync_native_paint(canvas: &Canvas2D) {
    if canvas.native.is_null() { return; }
    sync_native_style(canvas, &canvas.fill, false);
    sync_native_style(canvas, &canvas.stroke, true);
    let shadow = drawing_color(&canvas.shadow);
    skia_canvas_set_shadow(canvas.native, shadow[0], shadow[1], shadow[2], shadow[3], canvas.shadow_blur as f32, canvas.shadow_offset_x as f32, canvas.shadow_offset_y as f32);
    skia_canvas_set_line_width(canvas.native, canvas.line_width as f32);
    let cap = if canvas.line_cap == "round" { 1 } else if canvas.line_cap == "square" { 2 } else { 0 };
    let join = if canvas.line_join == "round" { 1 } else if canvas.line_join == "bevel" { 2 } else { 0 };
    skia_canvas_set_stroke_style(canvas.native, cap, join, canvas.miter_limit as f32);
    let dash: Vec<f32> = canvas.line_dash.iter().map(|value| *value as f32).collect();
    skia_canvas_set_line_dash(canvas.native, dash.as_ptr(), dash.len() as u32, canvas.line_dash_offset as f32);
    skia_canvas_set_global_alpha(canvas.native, canvas.global_alpha as f32);
    skia_canvas_set_composite(canvas.native, canvas.composite_mode as i32);
    skia_canvas_set_image_smoothing(canvas.native, canvas.image_smoothing as i32);
    skia_canvas_set_image_quality(canvas.native,match canvas.image_quality.as_str(){"high"=>2,"medium"=>1,_=>0});
    let ops = parse_filter(&canvas.filter).unwrap_or_default();
    skia_canvas_set_filter(canvas.native, ops.as_ptr(), (ops.len() / 8) as u32);
}

fn text_context(canvas:&Canvas2D)->*mut c_void {if canvas.native.is_null(){canvas.text_cache.context}else{canvas.native}}
unsafe fn sync_native_text(canvas:&Canvas2D, font:&FontSpec) {
    let resolve=|value:&str,from_font:bool| {
        let n=canvas_css::spacing(value,font.size).map_or(0.0,|(_,n)|n);
        if value.ends_with("ex") || value.ends_with("ch") || value.ends_with("cap") {
            if from_font{return if value.ends_with("ex"){value[..value.len()-if value.ends_with("rex"){3}else{2}].parse::<f64>().unwrap_or(0.0)*font.size*0.5}else{0.0};}
            let unit=if value.ends_with("cap"){2}else{value.ends_with("ch") as i32};
            let suffix=(if unit==2{3}else{2})+if value.ends_with("rcap")||value.ends_with("rex")||value.ends_with("rch"){1}else{0};
            value[..value.len()-suffix].parse::<f64>().unwrap_or(0.0)*skia_canvas_spacing_unit(font.family.as_ptr(),font.size as f32,font.weight,font.slant,unit) as f64
        }else{n}
    };
    let letter=resolve(&canvas.letter_spacing,canvas.letter_spacing_from_font);
    let word=resolve(&canvas.word_spacing,canvas.word_spacing_from_font);
    skia_canvas_set_text_options(text_context(canvas),letter as f32,word as f32,(canvas.font_kerning!="none") as i32,(canvas.direction=="rtl") as i32,font.slant);
    let stretch=["ultra-condensed","extra-condensed","condensed","semi-condensed","normal","semi-expanded","expanded","extra-expanded","ultra-expanded"].iter().position(|v|*v==canvas.font_stretch).unwrap_or(4)+1;
    let caps=["normal","small-caps","all-small-caps","petite-caps","all-petite-caps","unicase","titling-caps"].iter().position(|v|*v==canvas.font_variant_caps).unwrap_or(0);
    let rendering=["auto","optimizeSpeed","optimizeLegibility","geometricPrecision"].iter().position(|v|*v==canvas.text_rendering).unwrap_or(0);
    skia_canvas_set_font_options(text_context(canvas),stretch as i32,caps as i32,rendering as i32);
}
struct FontSpec { family: CString, size: f64, weight: i32, slant: i32, small_caps: i32 }

// Unicode full uppercase can expand one scalar (e.g. sharp s) to three scalars.
// The C++ text layout caller supplies a buffer with capacity three.
#[no_mangle]
pub unsafe extern "C" fn canvas_uppercase(codepoint:u32, output:*mut u32)->u32 {
    let Some(ch)=char::from_u32(codepoint) else{return 0;};
    if output.is_null(){return 0;}
    let mut count=0;for upper in ch.to_uppercase(){output.add(count).write(upper as u32);count+=1;}
    count as u32
}

#[no_mangle]
pub unsafe extern "C" fn canvas_lowercase(codepoint:u32, output:*mut u32)->u32 {
    let Some(ch)=char::from_u32(codepoint) else{return 0;};
    if output.is_null(){return 0;}
    let mut count=0;for lower in ch.to_lowercase(){output.add(count).write(lower as u32);count+=1;}
    count as u32
}

fn font_spec(value: &str) -> FontSpec {
    let lowercase = value.to_ascii_lowercase();
    let mut size = 10.0;
    let mut suffix = "";
    let mut prefix = "";
    for (index, _) in lowercase.match_indices("px") {
        let before = &value[..index];
        let token = before.split_whitespace().last().unwrap_or("").split('/').next().unwrap_or("");
        if let Ok(parsed) = token.parse::<f64>() {
            if parsed.is_finite() && parsed >= 0.0 {
                size = parsed; suffix = &value[index + 2..];
                // The numeric size is not a font-weight token (weights may now be 1..1000).
                prefix = before.rsplit_once(char::is_whitespace).map(|(head,_)|head).unwrap_or("");
                break;
            }
        }
    }
    let mut family = suffix.trim();
    if family.is_empty() { family = "Arial"; }
    let tokens: Vec<&str> = prefix.split_whitespace().collect();
    let requested_angle=tokens.windows(2).find_map(|pair|if pair[0]=="oblique"{pair[1].strip_suffix("deg").and_then(|n|n.parse::<f64>().ok())}else{None});
    // Blink's Windows matching prefers an italic face for slopes between 0
    // and the default 14 degrees, but synthesizes oblique only at the default.
    // Slant 3 requests an italic face without DirectWrite's synthetic oblique.
    let slant = if let Some(angle)=requested_angle { if angle==14.0{1}else if angle>0.0&&angle<14.0{3}else{0} }
                else if tokens.iter().any(|token| token.eq_ignore_ascii_case("oblique")) { 2 }
                else if tokens.iter().any(|token| token.eq_ignore_ascii_case("italic")) { 1 } else { 0 };
    let weight = if tokens.iter().any(|token| token.eq_ignore_ascii_case("bold") || token.eq_ignore_ascii_case("bolder")) { 700 }
        else { tokens.iter().find_map(|token| token.parse::<i32>().ok()).filter(|weight| (1..=1000).contains(weight)).unwrap_or(400) };
    FontSpec { family: CString::new(family).unwrap_or_else(|_| CString::new("Arial").unwrap()), size, weight, slant, small_caps: tokens.contains(&"small-caps") as i32 }
}

fn text_align_offset(canvas: &Canvas2D, width: f64) -> f64 {
    match canvas.text_align.as_str() {
        "center" => width / 2.0,
        "right" => width,
        "start" if canvas.direction == "rtl" => width,
        "end" if canvas.direction != "rtl" => width,
        _ => 0.0,
    }
}

unsafe fn text_font_metrics(canvas: &Canvas2D, font: &FontSpec) -> (f32, f32) {
    let (mut a, mut d) = (-(font.size as f32) * 0.8, (font.size as f32) * 0.2);
    {
        skia_canvas_font_metrics(text_context(canvas), font.family.as_ptr(), font.size as f32, font.weight, font.slant, &mut a, &mut d);
    }
    a = -a;
    // Blink preserves subpixel ascent/descent for tiny Canvas fonts so the
    // different baselines do not collapse onto the same coordinate.
    if a < 3.0 || a + d < 2.0 { (a, d) } else { (a.round(), d.round()) }
}

unsafe fn text_baseline_offset(canvas: &Canvas2D, font: &FontSpec) -> f64 {
    if canvas.text_baseline == "alphabetic" { return 0.0; }
    let mut ascent = 0.0f32; let mut descent = 0.0f32;
    if matches!(canvas.text_baseline.as_str(), "top" | "bottom" | "middle") {
        skia_canvas_typo_metrics(text_context(canvas), font.family.as_ptr(), font.size as f32, font.weight, font.slant, &mut ascent, &mut descent);
        return match canvas.text_baseline.as_str() {
            "top" => ascent as f64,
            "bottom" => -(descent as f64),
            _ => (ascent as f64 - descent as f64) / 2.0,
        };
    }
    let (ascent, descent) = text_font_metrics(canvas, font);
    match canvas.text_baseline.as_str() {
        "hanging" => (ascent * 80.0f32 / 100.0f32) as f64,
        "ideographic" => -(descent as f64),
        _ => 0.0,
    }
}

unsafe extern "C" fn get_canvas_property(env: NapiEnv, info: NapiCallbackInfo) -> NapiValue {
    let (_, this_arg, data) = callback_info(env, info);
    let host=CanvasHost::from_callback(data);
    let data=data & !HTML_HOST_BIT;
    let Some(c) = canvas_2d_from(env, this_arg, host) else { return type_error(env,"Illegal invocation"); };
    match data {
        0 => style_value(env, &c.fill),
        1 => style_value(env, &c.stroke),
        2 => style_value(env, &c.shadow),
        3 => number_value(env, c.shadow_blur), 4 => number_value(env, c.line_width), 10 => number_value(env, c.shadow_offset_x), 11 => number_value(env, c.shadow_offset_y),
        5 => number_value(env, c.global_alpha), 6 => string(env, &canvas_css::serialized_font_caps(&c.font,&c.font_variant_caps)),
        7 => string(env, &c.text_align), 8 => string(env, &c.text_baseline),
        18 => string(env,&canvas_css::serialized_spacing(&c.letter_spacing)), 19 => string(env,&canvas_css::serialized_spacing(&c.word_spacing)), 20 => string(env,&c.font_kerning), 21 => string(env,&c.image_quality),
        22 => string(env,&c.font_stretch),23 => string(env,&c.font_variant_caps),24 => string(env,&c.text_rendering),
        25 => string(env,&c.filter),26 => string(env,&c.lang),
        17 => string(env, if c.direction == "inherit" { "ltr" } else { &c.direction }),
        9 => string(env, COMPOSITE_MODES[c.composite_mode]), 12 => string(env, &c.line_cap), 13 => string(env, &c.line_join), 14 => number_value(env, c.miter_limit), 15 => number_value(env, c.line_dash_offset), 16 => boolean(env, c.image_smoothing), _ => undefined(env)
    }
}

unsafe extern "C" fn set_canvas_property(env: NapiEnv, info: NapiCallbackInfo) -> NapiValue {
    let (args, this_arg, data) = callback_info(env, info);
    // Check the receiver before running user conversions; end this temporary
    // borrow before toString/valueOf can re-enter the context.
    let host=CanvasHost::from_callback(data);
    let data=data & !HTML_HOST_BIT;
    if canvas_2d_from(env, this_arg, host).is_none() { return type_error(env,"Illegal invocation"); }
    let Some(value) = args.first() else { return undefined(env); };
    // Convert strings before borrowing mutable state: toString can re-enter Canvas.
    let prepared=if [0,1,2,6,7,8,9,12,13,17,18,19,20,21,22,23,24,25,26].contains(&data){
        let(mut gradient,mut pattern)=(false,false);
        if data<=1{(api().check_object_type_tag)(env,*value,&GRADIENT_TYPE_TAG,&mut gradient);(api().check_object_type_tag)(env,*value,&PATTERN_TYPE_TAG,&mut pattern);}
        if gradient||pattern{None}else{let Some(s)=dom_string(env,*value)else{return undefined(env);};Some(s)}
    }else{None};
    let prepared_number=if [3,4,5,10,11,14,15].contains(&data){
        let mut converted=ptr::null_mut();
        if (api().coerce_to_number)(env,*value,&mut converted)!=0{return undefined(env);}
        Some(number(env,converted))
    }else{None};
    let Some(c) = canvas_2d_from(env, this_arg, host) else { return type_error(env,"Illegal invocation"); };
    match data {
        0 | 1 => {
            if let Some(s) = prepared.clone() {
                if let Some(col) = parse_color(&s) {
                    let style=css_style(&s, col);
                    if data == 0 { c.fill = style; } else { c.stroke = style; }
                }
            } else {
                let mut raw=ptr::null_mut();
                let mut is_gradient = false;
                let mut is_pattern = false;
                (api().check_object_type_tag)(env, *value, &GRADIENT_TYPE_TAG, &mut is_gradient);
                (api().check_object_type_tag)(env, *value, &PATTERN_TYPE_TAG, &mut is_pattern);
                if (is_gradient || is_pattern) && (api().unwrap)(env,*value,&mut raw)==0 && !raw.is_null() {
                    if is_gradient {
                        let g=&*(raw as *mut GradientObject);
                        let mut reference = ptr::null_mut();
                        if (api().create_reference)(env, *value, 1, &mut reference) != 0 { return undefined(env); }
                        let style = Style::Gradient(Rc::new(GradientStyle { data: g.0.clone(), env, reference }));
                        if data==0 {c.fill=style;} else {c.stroke=style;}
                    } else if is_pattern {
                        let p=&*(raw as *mut PatternObject);
                        let mut reference=ptr::null_mut();
                        if (api().create_reference)(env,*value,1,&mut reference)!=0 { return undefined(env); }
                        let style=Style::Pattern(Rc::new(PatternStyle{data:p.0.clone(),env,reference}));
                        if data==0 {c.fill=style;} else {c.stroke=style;}
                    }
                }
            }
        },
        2 => if let Some(s) = prepared.clone() { if let Some(col) = parse_color(&s) { c.shadow = css_style(&s, col); } },
        3 => { let n = prepared_number.unwrap(); if n.is_finite() && n >= 0.0 { c.shadow_blur = canvas_float(n) as f64; } }, 4 => { let n = prepared_number.unwrap(); if n.is_finite() && n > 0.0 { c.line_width = canvas_float(n) as f64; } },
        10 => { let n = prepared_number.unwrap(); if n.is_finite() { c.shadow_offset_x = canvas_float(n) as f64; } }, 11 => { let n = prepared_number.unwrap(); if n.is_finite() { c.shadow_offset_y = canvas_float(n) as f64; } },
        5 => {
            let n = prepared_number.unwrap();
            if n.is_finite() && (0.0..=1.0).contains(&n) { c.global_alpha = n; }
        },
        6 => if let Some(s) = prepared.clone() { if let Some(font) = canvas_css::font(&s) { c.font_variant_caps=if font_spec(&font).small_caps!=0{"small-caps"}else{"normal"}.into();c.font_stretch="normal".into();c.font = font;c.letter_spacing_from_font=true;c.word_spacing_from_font=true; } },
        7 => if let Some(s) = prepared.clone() { if ["left", "right", "center", "start", "end"].contains(&s.as_str()) { c.text_align = s; } }, 8 => if let Some(s) = prepared.clone() { if ["top", "hanging", "middle", "alphabetic", "ideographic", "bottom"].contains(&s.as_str()) { c.text_baseline = s; } },
        9 => if let Some(s) = prepared.clone() { if let Some(mode)=COMPOSITE_MODES.iter().position(|name|!name.is_empty() && *name==s) { c.composite_mode=mode; } },
        12 => if let Some(s) = prepared.clone() { if ["butt", "round", "square"].contains(&s.as_str()) { c.line_cap = s; } },
        13 => if let Some(s) = prepared.clone() { if ["miter", "round", "bevel"].contains(&s.as_str()) { c.line_join = s; } },
        17 => if let Some(s) = prepared.clone() { if ["inherit", "ltr", "rtl"].contains(&s.as_str()) { c.direction = s; } },
        14 => { let n = prepared_number.unwrap(); if n.is_finite() && n > 0.0 { c.miter_limit = canvas_float(n) as f64; } },
        15 => { let n = prepared_number.unwrap(); if n.is_finite() { c.line_dash_offset = canvas_float(n) as f64; } },
        18 | 19 => {if let Some((text,_))=canvas_css::spacing(prepared.as_deref().unwrap_or(""),font_spec(&c.font).size){if data==18{if text!=c.letter_spacing{c.letter_spacing_from_font=false;c.letter_spacing=text;}}else if text!=c.word_spacing{c.word_spacing_from_font=false;c.word_spacing=text;}}},
        20 => {let v=prepared.as_deref().unwrap_or("");if matches!(v,"auto"|"normal"|"none"){c.font_kerning=v.into();}},
        21 => {let v=prepared.as_deref().unwrap_or("");if matches!(v,"low"|"medium"|"high"){c.image_quality=v.into();}},
        22 => {let v=prepared.as_deref().unwrap_or("");if ["ultra-condensed","extra-condensed","condensed","semi-condensed","normal","semi-expanded","expanded","extra-expanded","ultra-expanded"].contains(&v){c.font_stretch=v.into();}},
        23 => {let v=prepared.as_deref().unwrap_or("");if ["normal","small-caps","all-small-caps","petite-caps","all-petite-caps","unicase","titling-caps"].contains(&v){c.font_variant_caps=v.into();}},
        24 => {let v=prepared.as_deref().unwrap_or("");if ["auto","optimizeSpeed","optimizeLegibility","geometricPrecision"].contains(&v){c.text_rendering=v.into();}},
        // An unparsable filter leaves the previous value in place; "none" clears it.
        25 => {let v=prepared.as_deref().unwrap_or("");if parse_filter(v).is_some(){c.filter=v.to_string();}},
        26 => {if let Some(v)=prepared.clone(){c.lang=v;}},
        16 => c.image_smoothing = truthy(env, Some(value)), _ => {}
    }
    undefined(env)
}

fn canvas_float(value: f64) -> f32 {
    value.clamp(-(f32::MAX as f64), f32::MAX as f64) as f32
}

fn canvas_rect(mut x:f64, mut y:f64, mut w:f64, mut h:f64) -> [f32;4] {
    if w<0.0 {x+=w;w=-w;}
    if h<0.0 {y+=h;h=-h;}
    [canvas_float(x),canvas_float(y),canvas_float(w),canvas_float(h)]
}

unsafe fn number_value(env: NapiEnv, value: f64) -> NapiValue {
    let mut result = ptr::null_mut();
    (api().create_double)(env, value, &mut result);
    result
}

// Path points are retained in device space for arcTo's current-point lookup
// and for the "does this operation need a backing store" test. Rasterization
// itself belongs entirely to the Skia surface.
fn tx(t: [f64; 6], x: f64, y: f64) -> (f64, f64) { (t[0]*x+t[2]*y+t[4], t[1]*x+t[3]*y+t[5]) }
unsafe extern "C" fn gradient_add_stop(env:NapiEnv, info:NapiCallbackInfo)->NapiValue {
    let (args,this_arg,_)=callback_info(env,info);
    if args.len()<2{return type_error(env,"addColorStop requires two arguments");}
    let mut tagged=false; (api().check_object_type_tag)(env,this_arg,&GRADIENT_TYPE_TAG,&mut tagged);
    if !tagged{return type_error(env,"Illegal invocation");}
    let mut raw=ptr::null_mut();if (api().unwrap)(env,this_arg,&mut raw)!=0 || raw.is_null(){return undefined(env);}
    let mut converted=ptr::null_mut();if (api().coerce_to_number)(env,args[0],&mut converted)!=0{return undefined(env);}
    let off=number(env,converted);
    if !off.is_finite(){return type_error(env,"Offset must be finite");}
    let Some(color)=dom_string(env,args[1])else{return undefined(env);};
    if !(0.0..=1.0).contains(&off){return dom_error(env,"IndexSizeError","Offset must be between zero and one");}
    let Some(col)=parse_color(&color) else{return dom_error(env,"SyntaxError","Invalid color");};
    let mut g=(*(raw as *mut GradientObject)).0.borrow_mut();g.stops.push((off,col,drawing_color(&css_style(&color,col))));g.stops.sort_by(|a,b|a.0.total_cmp(&b.0));
    undefined(env)
}
unsafe fn create_gradient(env:NapiEnv, g:Gradient)->NapiValue { let mut o=ptr::null_mut(); (api().create_object)(env,&mut o); (api().type_tag_object)(env,o,&GRADIENT_TYPE_TAG); (api().wrap)(env,o,Box::into_raw(Box::new(GradientObject(Rc::new(RefCell::new(g))))) as *mut c_void,Some(finalize_gradient),ptr::null_mut(),ptr::null_mut()); let mut f=ptr::null_mut(); (api().create_function)(env,b"addColorStop\0".as_ptr() as *const c_char,12,gradient_add_stop,ptr::null_mut(),&mut f); set(env,o,"addColorStop",f); o }
unsafe extern "C" fn pattern_set_transform(env:NapiEnv, info:NapiCallbackInfo)->NapiValue {
    let (args,this_arg,_)=callback_info(env,info);
    let mut tagged=false;(api().check_object_type_tag)(env,this_arg,&PATTERN_TYPE_TAG,&mut tagged);
    if !tagged{return type_error(env,"Illegal invocation");}
    let mut raw=ptr::null_mut();
    if (api().unwrap)(env,this_arg,&mut raw)!=0 || raw.is_null() || args.len()<6{return undefined(env);}
    // The JS adapter completes dictionary conversion before this borrow.
    let matrix=std::array::from_fn(|i|number(env,args[i]));
    (*(raw as *mut PatternObject)).0.borrow_mut().matrix=matrix;
    undefined(env)
}
unsafe fn create_pattern(env:NapiEnv, pattern:Pattern)->NapiValue {
    let mut o=ptr::null_mut();(api().create_object)(env,&mut o);
    (api().type_tag_object)(env,o,&PATTERN_TYPE_TAG);
    (api().wrap)(env,o,Box::into_raw(Box::new(PatternObject(Rc::new(RefCell::new(pattern))))) as *mut c_void,Some(finalize_pattern),ptr::null_mut(),ptr::null_mut());
    let mut f=ptr::null_mut();
    (api().create_function)(env,b"setTransform\0".as_ptr() as *const c_char,12,pattern_set_transform,ptr::null_mut(),&mut f);
    set(env,o,"setTransform",f);o
}

const PATH_METHODS: &[&str] = &[
    "_fromSVG", "moveTo", "lineTo", "quadraticCurveTo", "bezierCurveTo", "closePath",
    "rect", "roundRect", "arcTo", "arc", "ellipse", "addPath",
];

unsafe fn create_path(env: NapiEnv, native: *mut c_void) -> NapiValue {
    let mut object = ptr::null_mut();
    (api().create_object)(env, &mut object);
    (api().type_tag_object)(env, object, &PATH_TYPE_TAG);
    (api().wrap)(env, object, Box::into_raw(Box::new(PathObject { native })) as *mut c_void,
                 Some(finalize_path), ptr::null_mut(), ptr::null_mut());
    for (index, name) in PATH_METHODS.iter().enumerate() {
        let mut function = ptr::null_mut();
        let name_c = CString::new(*name).unwrap();
        (api().create_function)(env, name_c.as_ptr(), name.len(), path_method, index as *mut c_void, &mut function);
        set(env, object, name, function);
    }
    object
}

unsafe extern "C" fn path_constructor(env: NapiEnv, info: NapiCallbackInfo) -> NapiValue {
    let (args, _, _) = callback_info(env, info);
    // A Path2D argument copies the existing path; everything else starts empty
    // and the JavaScript wrapper feeds any SVG string through _fromSVG.
    let native = match args.first().and_then(|value| path_from(env, *value)) {
        Some(source) => skia_path_clone(source),
        None => skia_path_create(),
    };
    create_path(env, native)
}

unsafe extern "C" fn path_method(env: NapiEnv, info: NapiCallbackInfo) -> NapiValue {
    let (args, this_arg, index) = callback_info(env, info);
    let Some(path) = path_from(env, this_arg) else { return type_error(env, "Illegal invocation"); };
    let name = PATH_METHODS.get(index).copied().unwrap_or("");
    let number_at = |i: usize| args.get(i).map(|v| number(env, *v)).unwrap_or(f64::NAN);
    match name {
        "_fromSVG" => {
            let Some(text) = args.first().and_then(|v| value_string(env, *v)) else { return boolean(env, false); };
            let Ok(text) = CString::new(text) else { return boolean(env, false); };
            boolean(env, skia_path_from_svg(path, text.as_ptr()) != 0)
        }
        "moveTo" | "lineTo" => {
            let (x, y) = (number_at(0), number_at(1));
            if x.is_finite() && y.is_finite() {
                if name == "moveTo" { skia_path_move_to(path, x as f32, y as f32); }
                else { skia_path_line_to(path, x as f32, y as f32); }
            }
            undefined(env)
        }
        "quadraticCurveTo" => {
            let v = [number_at(0), number_at(1), number_at(2), number_at(3)];
            if v.iter().all(|n| n.is_finite()) {
                skia_path_quad_to(path, v[0] as f32, v[1] as f32, v[2] as f32, v[3] as f32);
            }
            undefined(env)
        }
        "bezierCurveTo" => {
            let v: [f64; 6] = std::array::from_fn(number_at);
            if v.iter().all(|n| n.is_finite()) {
                skia_path_cubic_to(path, v[0] as f32, v[1] as f32, v[2] as f32,
                                   v[3] as f32, v[4] as f32, v[5] as f32);
            }
            undefined(env)
        }
        "closePath" => { skia_path_close(path); undefined(env) }
        "rect" => {
            let v = [number_at(0), number_at(1), number_at(2), number_at(3)];
            if v.iter().all(|n| n.is_finite()) {
                skia_path_rect(path, v[0] as f32, v[1] as f32, v[2] as f32, v[3] as f32);
            }
            undefined(env)
        }
        "roundRect" => {
            let v = [number_at(0), number_at(1), number_at(2), number_at(3)];
            if !v.iter().all(|n| n.is_finite()) { return undefined(env); }
            let Some(radii) = round_rect_radii(env, args.get(4).copied(), v[2], v[3]) else { return undefined(env); };
            let native_radii = radii.map(|r| r.map(|c| c as f32)).concat();
            skia_path_round_rect(path, v[0] as f32, v[1] as f32, v[2] as f32, v[3] as f32, native_radii.as_ptr());
            undefined(env)
        }
        "arcTo" => {
            let v = [number_at(0), number_at(1), number_at(2), number_at(3), number_at(4)];
            if !v.iter().all(|n| n.is_finite()) { return undefined(env); }
            if canvas_float(v[4]) < 0.0 { return dom_error(env, "IndexSizeError", "Negative arcTo radius"); }
            skia_path_arc_to(path, v[0] as f32, v[1] as f32, v[2] as f32, v[3] as f32, v[4] as f32);
            undefined(env)
        }
        "arc" => {
            let v = [number_at(0), number_at(1), number_at(2), number_at(3), number_at(4)];
            if canvas_float(v[2]) < 0.0 { return dom_error(env, "IndexSizeError", "Negative arc radius"); }
            if !v.iter().all(|n| n.is_finite()) { return undefined(env); }
            skia_path_arc(path, v[0] as f32, v[1] as f32, v[2] as f32, v[3] as f32, v[4] as f32,
                          truthy(env, args.get(5)) as i32);
            undefined(env)
        }
        "ellipse" => {
            let v: [f64; 7] = std::array::from_fn(number_at);
            if canvas_float(v[2]) < 0.0 || canvas_float(v[3]) < 0.0 {
                return dom_error(env, "IndexSizeError", "Negative ellipse radius");
            }
            if !v.iter().all(|n| n.is_finite()) { return undefined(env); }
            skia_path_ellipse(path, v[0] as f32, v[1] as f32, v[2] as f32, v[3] as f32,
                              v[4] as f32, v[5] as f32, v[6] as f32, truthy(env, args.get(7)) as i32);
            undefined(env)
        }
        "addPath" => {
            let Some(source) = args.first().and_then(|v| path_from(env, *v)) else {
                return type_error(env, "Expected a Path2D");
            };
            // The JavaScript wrapper has already converted the matrix dictionary.
            let matrix: [f64; 6] = std::array::from_fn(|i| args.get(i + 1).map(|v| number(env, *v)).unwrap_or(f64::NAN));
            if matrix.iter().all(|n| n.is_finite()) {
                skia_path_add_path(path, source, matrix.as_ptr());
            }
            undefined(env)
        }
        _ => undefined(env),
    }
}

unsafe fn reset_canvas_state(canvas: &mut Canvas2D, clear_native: bool) {
 canvas.fill=Style::Color([0,0,0,255]); canvas.stroke=Style::Color([0,0,0,255]); canvas.shadow=Style::Color([0,0,0,0]); canvas.shadow_blur=0.0; canvas.shadow_offset_x=0.0; canvas.shadow_offset_y=0.0; canvas.transform=[1.0,0.0,0.0,1.0,0.0,0.0]; canvas.path.clear(); canvas.current_path=None; canvas.line_width=1.0; canvas.line_cap="butt".to_string(); canvas.line_join="miter".to_string(); canvas.miter_limit=10.0; canvas.line_dash.clear(); canvas.line_dash_offset=0.0; canvas.global_alpha=1.0; canvas.composite_mode=3; canvas.image_smoothing=true;canvas.image_quality="low".into();canvas.letter_spacing="0px".into();canvas.word_spacing="0px".into();canvas.letter_spacing_from_font=false;canvas.word_spacing_from_font=false;canvas.font_kerning="auto".into();canvas.font_stretch="normal".into();canvas.font_variant_caps="normal".into();canvas.text_rendering="auto".into(); canvas.filter="none".into(); canvas.lang="inherit".into(); canvas.font="10px sans-serif".to_string(); canvas.text_align="start".to_string(); canvas.text_baseline="alphabetic".to_string(); canvas.direction="inherit".to_string(); canvas.state_stack.clear(); if clear_native && !canvas.native.is_null(){skia_canvas_reset(canvas.native);}
}

unsafe extern "C" fn canvas_2d_method(env: NapiEnv, info: NapiCallbackInfo) -> NapiValue {
    let (args, this_arg, index) = callback_info(env, info);
    let host=CanvasHost::from_callback(index);
    let index=index & !HTML_HOST_BIT;
    let name = CANVAS_2D_METHODS.get(index).copied().unwrap_or("");
    let Some(canvas) = canvas_2d_from(env, this_arg, host) else { return type_error(env,"Illegal invocation"); };
    // Blink requests a backing store only after each operation's early exits.
    // Invalid reads and empty paths/rectangles must not poison a later resize.
    let requests_bitmap=match name {
        "fillRect"|"clearRect"|"strokeRect" => args.len()>=4 && !(number(env,args[2])==0.0 && number(env,args[3])==0.0),
        "fill"|"stroke" => !canvas.path.is_empty(),
        "fillText"|"strokeText"|"drawImage"|"putImageData"|"clip"|"save"|"isPointInPath"|"isPointInStroke"|"scale"|"rotate"|"translate"|"transform"|"setTransform"|"resetTransform"|"_ensureBitmap"
            |"_fillPath"|"_strokePath"|"_clipPath"|"_pointInPath" => true,
        "restore" => !canvas.state_stack.is_empty(),
        _ => false,
    };
    if requests_bitmap && canvas.native.is_null() && canvas.width>0 && canvas.height>0 {canvas.context_lost=true;}
    if canvas.context_lost && matches!(name,"save"|"restore"|"scale"|"rotate"|"translate"|"transform"|"setTransform"|"resetTransform") {return undefined(env);}
    match name {
        "fillRect" | "clearRect" => {
            if args.len() >= 4 {
                let x=number(env,args[0]); let y=number(env,args[1]); let w=number(env,args[2]); let h=number(env,args[3]);
                // Validate the double dimensions before float underflow at the Skia ABI.
                if w == 0.0 && h == 0.0 { return undefined(env); }
                if !canvas.native.is_null() {
                    let [x,y,w,h]=canvas_rect(x,y,w,h);
                    if name == "clearRect" { skia_canvas_clear_rect(canvas.native, x, y, w, h); }
                    else { sync_native_paint(canvas); skia_canvas_fill_rect(canvas.native, x, y, w, h); }
                }
            }
            undefined(env)
        }
        "drawImage" => {
            if args.len() < 3 || canvas.native.is_null() { return undefined(env); }
            let color_space=string_option(env,args.first().copied(),"colorSpace","srgb")=="display-p3";
            let float16=string_option(env,args.first().copied(),"pixelFormat","rgba-unorm8")=="rgba-float16";
            let stride=if float16{8}else{4};
            let mut data = ptr::null_mut(); let mut width_value = ptr::null_mut(); let mut height_value = ptr::null_mut();
            let data_name = CString::new("data").unwrap(); let width_name = CString::new("width").unwrap(); let height_name = CString::new("height").unwrap();
            if (api().get_named_property)(env, args[0], data_name.as_ptr(), &mut data) != 0 ||
               (api().get_named_property)(env, args[0], width_name.as_ptr(), &mut width_value) != 0 ||
               (api().get_named_property)(env, args[0], height_name.as_ptr(), &mut height_value) != 0 { return undefined(env); }
            let mut width = 0u32; let mut height = 0u32;
            (api().get_value_uint32)(env, width_value, &mut width); (api().get_value_uint32)(env, height_value, &mut height);
            let mut kind = 0i32; let mut length = 0usize; let mut source = ptr::null_mut(); let mut buffer = ptr::null_mut(); let mut offset = 0usize;
            if width == 0 || height == 0 || (api().get_typedarray_info)(env, data, &mut kind, &mut length, &mut source, &mut buffer, &mut offset) != 0 || source.is_null() || length < width as usize * height as usize * stride { return undefined(env); }
            let (sx, sy, sw, sh, dx, dy, dw, dh) = if args.len() >= 9 {
                (number(env,args[1]), number(env,args[2]), number(env,args[3]), number(env,args[4]), number(env,args[5]), number(env,args[6]), number(env,args[7]), number(env,args[8]))
            } else if args.len() >= 5 {
                (0.0, 0.0, width as f64, height as f64, number(env,args[1]), number(env,args[2]), number(env,args[3]), number(env,args[4]))
            } else {
                (0.0, 0.0, width as f64, height as f64, number(env,args[1]), number(env,args[2]), width as f64, height as f64)
            };
            let mut opaque_value=ptr::null_mut();
            let opaque_name=CString::new("opaque").unwrap();
            (api().get_named_property)(env,args[0],opaque_name.as_ptr(),&mut opaque_value);
            let opaque=truthy(env,Some(&opaque_value));
            let sn=CString::new("shadowOpaque").unwrap();(api().get_named_property)(env,args[0],sn.as_ptr(),&mut opaque_value);let shadow_opaque=truthy(env,Some(&opaque_value));
            sync_native_paint(canvas);
            skia_canvas_draw_rgba_image(canvas.native, source as *const u8, width, height, opaque as i32, shadow_opaque as i32, color_space as i32,float16 as i32, sx as f32, sy as f32, sw as f32, sh as f32, dx as f32, dy as f32, dw as f32, dh as f32);
            undefined(env)
        }
        "createPattern" => {
            if args.len() < 1 { return undefined(env); }
            let color_space=string_option(env,args.first().copied(),"colorSpace","srgb")=="display-p3";
            let float16=string_option(env,args.first().copied(),"pixelFormat","rgba-unorm8")=="rgba-float16";
            let stride=if float16{8}else{4};
            let mut data=ptr::null_mut(); let mut wv=ptr::null_mut(); let mut hv=ptr::null_mut();
            let dn=CString::new("data").unwrap(); let wn=CString::new("width").unwrap(); let hn=CString::new("height").unwrap();
            if (api().get_named_property)(env,args[0],dn.as_ptr(),&mut data)!=0 || (api().get_named_property)(env,args[0],wn.as_ptr(),&mut wv)!=0 || (api().get_named_property)(env,args[0],hn.as_ptr(),&mut hv)!=0 { return undefined(env); }
            let mut width=0u32; let mut height=0u32; (api().get_value_uint32)(env,wv,&mut width); (api().get_value_uint32)(env,hv,&mut height);
            let mut kind=0i32; let mut length=0usize; let mut source=ptr::null_mut(); let mut buffer=ptr::null_mut(); let mut offset=0usize;
            if width==0 || height==0 || (api().get_typedarray_info)(env,data,&mut kind,&mut length,&mut source,&mut buffer,&mut offset)!=0 || source.is_null() || length < width as usize*height as usize*stride { return undefined(env); }
            let repetition=args.get(1).and_then(|v|value_string(env,*v)).unwrap_or_else(||"repeat".to_string());
            let (repeat_x,repeat_y)=match repetition.as_str() { "repeat-x"=>(true,false), "repeat-y"=>(false,true), "no-repeat"=>(false,false), _=>(true,true) };
            let mut ov=ptr::null_mut();let on=CString::new("opaque").unwrap();(api().get_named_property)(env,args[0],on.as_ptr(),&mut ov);let opaque=truthy(env,Some(&ov));
            create_pattern(env,Pattern{opaque,color_space,float16,pixels:std::slice::from_raw_parts(source as *const u8,width as usize*height as usize*stride).to_vec(),width,height,repeat_x,repeat_y,matrix:[1.0,0.0,0.0,1.0,0.0,0.0]})
        }
        "createLinearGradient" | "createRadialGradient" | "createConicGradient" => {
            let count = match name { "createLinearGradient" => 4, "createRadialGradient" => 6, _ => 3 };
            if args.len() < count { return type_error(env, "Not enough gradient arguments"); }
            let mut values = [0.0; 6];
            // Convert all arguments before checking radii, as Web IDL does.
            for index in 0..count {
                let Some(n) = webidl_double(env, args[index]) else { return undefined(env); };
                values[index] = n;
            }
            let (kind, parameters) = match name {
                "createLinearGradient" => (1, values),
                "createRadialGradient" => {
                    if values[2] < 0.0 || values[5] < 0.0 {
                        return dom_error(env, "IndexSizeError", "Negative gradient radius");
                    }
                    (2, [values[0], values[1], values[3], values[4], values[2], values[5]])
                },
                _ => {
                    // Normalize in double precision before crossing the float Skia ABI.
                    let angle = values[0].rem_euclid(std::f64::consts::TAU);
                    (3, [values[1], values[2], angle, 0.0, 0.0, 0.0])
                },
            };
            create_gradient(env, Gradient { kind, args: parameters, stops: Vec::new() })
        }
        "beginPath" => { canvas.path.clear(); canvas.current_path=None; if !canvas.native.is_null(){skia_canvas_begin_path(canvas.native);} undefined(env) }
        "closePath" => { if let Some(i)=canvas.current_path { canvas.path[i].closed=true; } if !canvas.native.is_null(){skia_canvas_close_path(canvas.native);} undefined(env) }
        "rect" => { if args.len()>=4 { let x=number(env,args[0]); let y=number(env,args[1]); let w=number(env,args[2]); let h=number(env,args[3]); if !canvas.native.is_null(){skia_canvas_rect(canvas.native,x as f32,y as f32,w as f32,h as f32);} let p=[tx(canvas.transform,x,y),tx(canvas.transform,x+w,y),tx(canvas.transform,x+w,y+h),tx(canvas.transform,x,y+h)]; canvas.path.push(Path{points:p.to_vec(),closed:true}); canvas.current_path=Some(canvas.path.len()-1); } undefined(env) }
        "roundRect" => {
            if args.len()>=4 {
                let x=number(env,args[0]); let y=number(env,args[1]); let w=number(env,args[2]); let h=number(env,args[3]);
                let Some(radii) = round_rect_radii(env, args.get(4).copied(), w, h) else { return undefined(env); };
                let native_radii = radii.map(|radius| radius.map(|component| component as f32)).concat();
                if !canvas.native.is_null(){skia_canvas_round_rect(canvas.native,x as f32,y as f32,w as f32,h as f32,native_radii.as_ptr());}
                // Keep the retained path in step with Skia for isPointInPath/clip.
                let (x0,x1)=(x.min(x+w),x.max(x+w)); let (y0,y1)=(y.min(y+h),y.max(y+h));
                let mut p=Path{points:Vec::new(),closed:true};
                let corners = [
                    (x0+radii[0][0], y0+radii[0][1], std::f64::consts::PI, radii[0]),
                    (x1-radii[1][0], y0+radii[1][1], 1.5*std::f64::consts::PI, radii[1]),
                    (x1-radii[2][0], y1-radii[2][1], 0.0, radii[2]),
                    (x0+radii[3][0], y1-radii[3][1], std::f64::consts::FRAC_PI_2, radii[3]),
                ];
                for (cx,cy,start,radius) in corners { for k in 0..=12 { let a=start+std::f64::consts::FRAC_PI_2*k as f64/12.0; p.points.push(tx(canvas.transform,cx+radius[0]*a.cos(),cy+radius[1]*a.sin())); } }
                canvas.path.push(p); canvas.current_path=Some(canvas.path.len()-1);
            } undefined(env)
        }
        "arcTo" => {
            if args.len()>=5 {
                let x1=number(env,args[0]); let y1=number(env,args[1]); let x2=number(env,args[2]); let y2=number(env,args[3]); let radius=number(env,args[4]);
                if canvas_float(radius) < 0.0 { return dom_error(env,"IndexSizeError","Negative arcTo radius"); }
                if !canvas.native.is_null(){skia_canvas_arc_to(canvas.native,x1 as f32,y1 as f32,x2 as f32,y2 as f32,radius as f32);}
                if let Some(i)=canvas.current_path {
                    if let Some(&(px,py))=canvas.path[i].points.last() {
                        let v0=((px-x1),(py-y1)); let v1=((x2-x1),(y2-y1));
                        let l0=(v0.0*v0.0+v0.1*v0.1).sqrt(); let l1=(v1.0*v1.0+v1.1*v1.1).sqrt();
                        if radius==0.0 || l0==0.0 || l1==0.0 { canvas.path[i].points.push(tx(canvas.transform,x1,y1)); }
                        else {
                            let u0=(v0.0/l0,v0.1/l0); let u1=(v1.0/l1,v1.1/l1); let dot=(u0.0*u1.0+u0.1*u1.1).clamp(-1.0,1.0);
                            let theta=dot.acos();
                            if theta.is_finite() && theta>1e-6 {
                                let d=radius/(theta*0.5).tan(); let t0=(x1+u0.0*d,y1+u0.1*d); let t1=(x1+u1.0*d,y1+u1.1*d);
                                let cross=u0.0*u1.1-u0.1*u1.0; let n=(-u0.1*cross.signum(),u0.0*cross.signum()); let center=(t0.0+n.0*radius,t0.1+n.1*radius);
                                let a0=(t0.1-center.1).atan2(t0.0-center.0); let mut sweep=(t1.1-center.1).atan2(t1.0-center.0)-a0; if cross<0.0 { while sweep>0.0{sweep-=2.0*std::f64::consts::PI;} } else { while sweep<0.0{sweep+=2.0*std::f64::consts::PI;} }
                                canvas.path[i].points.push(tx(canvas.transform,t0.0,t0.1));
                                for k in 1..=16 { let a=a0+sweep*k as f64/16.0; canvas.path[i].points.push(tx(canvas.transform,center.0+radius*a.cos(),center.1+radius*a.sin())); }
                            }
                        }
                    }
                }
            } undefined(env)
        }
        "arc" => { if args.len()>=5 { let x=number(env,args[0]); let y=number(env,args[1]); let r=number(env,args[2]); let sa=number(env,args[3]); let ea=number(env,args[4]); if canvas_float(r)<0.0{return dom_error(env,"IndexSizeError","Negative arc radius");}if ![x,y,r,sa,ea].iter().all(|v|v.is_finite()){return undefined(env);}if !canvas.native.is_null(){skia_canvas_arc(canvas.native,x as f32,y as f32,r as f32,sa as f32,ea as f32,truthy(env,args.get(5)) as i32);} let i=canvas.path.len(); let mut p=Path{points:Vec::new(),closed:false}; for k in 0..=64 { let t=sa+(ea-sa)*k as f64/64.0; p.points.push(tx(canvas.transform,x+r*t.cos(),y+r*t.sin())); } canvas.path.push(p); canvas.current_path=Some(i); } undefined(env) }
        "moveTo" | "lineTo" => { if args.len()>=2 { let raw_x=number(env,args[0]);let raw_y=number(env,args[1]); let (x,y)=tx(canvas.transform,raw_x,raw_y); if name=="moveTo" || canvas.current_path.is_none() { canvas.path.push(Path{points:vec![(x,y)],closed:false}); canvas.current_path=Some(canvas.path.len()-1); } else if let Some(i)=canvas.current_path { canvas.path[i].points.push((x,y)); } if !canvas.native.is_null(){if name=="moveTo"{skia_canvas_move_to(canvas.native,raw_x as f32,raw_y as f32)}else{skia_canvas_line_to(canvas.native,raw_x as f32,raw_y as f32)}} } undefined(env) }
        "quadraticCurveTo" => { if args.len()>=4 { let (x1,y1,x2,y2)=(number(env,args[0]),number(env,args[1]),number(env,args[2]),number(env,args[3])); if !canvas.native.is_null(){skia_canvas_quad_to(canvas.native,x1 as f32,y1 as f32,x2 as f32,y2 as f32);} if let Some(i)=canvas.current_path { let p=*canvas.path[i].points.last().unwrap(); let q=tx(canvas.transform,x1,y1); let e=tx(canvas.transform,x2,y2); for n in 1..=32 { let t=n as f64/32.0; let m=1.0-t; canvas.path[i].points.push((m*m*p.0+2.0*m*t*q.0+t*t*e.0,m*m*p.1+2.0*m*t*q.1+t*t*e.1)); } } } undefined(env) }
        "bezierCurveTo" => { if args.len()>=6 { let (x1,y1,x2,y2,x3,y3)=(number(env,args[0]),number(env,args[1]),number(env,args[2]),number(env,args[3]),number(env,args[4]),number(env,args[5])); if !canvas.native.is_null(){skia_canvas_cubic_to(canvas.native,x1 as f32,y1 as f32,x2 as f32,y2 as f32,x3 as f32,y3 as f32);} if let Some(i)=canvas.current_path { let p=*canvas.path[i].points.last().unwrap(); let q=tx(canvas.transform,x1,y1); let r=tx(canvas.transform,x2,y2); let e=tx(canvas.transform,x3,y3); for n in 1..=48 { let t=n as f64/48.0; let m=1.0-t; canvas.path[i].points.push((m*m*m*p.0+3.0*m*m*t*q.0+3.0*m*t*t*r.0+t*t*t*e.0,m*m*m*p.1+3.0*m*m*t*q.1+3.0*m*t*t*r.1+t*t*t*e.1)); } } } undefined(env) }
        "ellipse" => { if args.len()>=7 { let (x,y,rx,ry,rot,sa,ea)=(number(env,args[0]),number(env,args[1]),number(env,args[2]),number(env,args[3]),number(env,args[4]),number(env,args[5]),number(env,args[6])); if canvas_float(rx)<0.0 || canvas_float(ry)<0.0{return dom_error(env,"IndexSizeError","Negative ellipse radius");}if ![x,y,rx,ry,rot,sa,ea].iter().all(|v|v.is_finite()){return undefined(env);}if !canvas.native.is_null(){skia_canvas_ellipse(canvas.native,x as f32,y as f32,rx as f32,ry as f32,rot as f32,sa as f32,ea as f32,truthy(env,args.get(7)) as i32);} let i=canvas.path.len(); let mut p=Path{points:Vec::new(),closed:true}; let n:usize=96; for k in 0..=n { let t: f64=sa+(ea-sa)*k as f64/n as f64; let (sx,sy)=(rx*t.cos(),ry*t.sin()); p.points.push(tx(canvas.transform,x+sx*rot.cos()-sy*rot.sin(),y+sx*rot.sin()+sy*rot.cos())); } canvas.path.push(p); canvas.current_path=Some(i); } undefined(env) }
        "fill" | "stroke" => { sync_native_paint(canvas); if !canvas.native.is_null(){if name=="fill"{let evenodd=args.first().and_then(|value|value_string(env,*value)).as_deref()==Some("evenodd");skia_canvas_fill(canvas.native,evenodd as i32)}else{skia_canvas_stroke(canvas.native)}} undefined(env) }
        "strokeRect" => {
            if args.len() >= 4 {
                let x=number(env,args[0]); let y=number(env,args[1]);
                let w=number(env,args[2]); let h=number(env,args[3]);
                if w == 0.0 && h == 0.0 { return undefined(env); }
                sync_native_paint(canvas);
                if !canvas.native.is_null() { let [x,y,w,h]=canvas_rect(x,y,w,h);skia_canvas_stroke_rect(canvas.native,x,y,w,h); }
            }
            undefined(env)
        }
        "scale" => { if args.len()>=1 { let sx=canvas_float(number(env,args[0])) as f64; let sy=if args.len()>1{canvas_float(number(env,args[1])) as f64}else{return type_error(env,"scale requires two arguments");}; canvas.transform[0]*=sx; canvas.transform[1]*=sx; canvas.transform[2]*=sy; canvas.transform[3]*=sy; if !canvas.native.is_null(){skia_canvas_scale(canvas.native,sx as f32,sy as f32);} } undefined(env) }
        "translate" => { if args.len()>=2 { if canvas.transform[0]*canvas.transform[3]-canvas.transform[1]*canvas.transform[2]==0.0{return undefined(env);} let x=canvas_float(number(env,args[0])) as f64;let y=canvas_float(number(env,args[1])) as f64; canvas.transform[4]+=canvas.transform[0]*x+canvas.transform[2]*y; canvas.transform[5]+=canvas.transform[1]*x+canvas.transform[3]*y; if !canvas.native.is_null(){skia_canvas_translate(canvas.native,x as f32,y as f32);} } undefined(env) }
        "rotate" => { if let Some(a)=args.first(){let a=number(env,*a);let (s,co)=a.sin_cos();let t=canvas.transform; canvas.transform=[t[0]*co+t[2]*s,t[1]*co+t[3]*s,t[2]*co-t[0]*s,t[3]*co-t[1]*s,t[4],t[5]];if !canvas.native.is_null(){skia_canvas_rotate(canvas.native,a);}} undefined(env) }
        "transform" => { if args.len()>=6 { let (a,b,c,d,e,f)=(canvas_float(number(env,args[0])) as f64,canvas_float(number(env,args[1])) as f64,canvas_float(number(env,args[2])) as f64,canvas_float(number(env,args[3])) as f64,canvas_float(number(env,args[4])) as f64,canvas_float(number(env,args[5])) as f64); let t=canvas.transform; canvas.transform=[t[0]*a+t[2]*b,t[1]*a+t[3]*b,t[0]*c+t[2]*d,t[1]*c+t[3]*d,t[0]*e+t[2]*f+t[4],t[1]*e+t[3]*f+t[5]];if !canvas.native.is_null(){skia_canvas_transform(canvas.native,a as f32,b as f32,c as f32,d as f32,e as f32,f as f32);}} undefined(env) }
        "resetTransform" => { let before=canvas.transform;canvas.transform=[1.0,0.0,0.0,1.0,0.0,0.0];if !canvas.native.is_null(){skia_canvas_set_transform(canvas.native,1.0,0.0,0.0,1.0,0.0,0.0,before.as_ptr());} undefined(env) }
        "setTransform" => { if args.len()>=6 { let before=canvas.transform; let (a,b,c,d,e,f)=(canvas_float(number(env,args[0])) as f64,canvas_float(number(env,args[1])) as f64,canvas_float(number(env,args[2])) as f64,canvas_float(number(env,args[3])) as f64,canvas_float(number(env,args[4])) as f64,canvas_float(number(env,args[5])) as f64);canvas.transform=[a,b,c,d,e,f];if !canvas.native.is_null(){skia_canvas_set_transform(canvas.native,a as f32,b as f32,c as f32,d as f32,e as f32,f as f32,before.as_ptr());}} undefined(env) }
        "setLineDash" => {
            let Some(array)=args.first() else{return type_error(env,"setLineDash requires a sequence");};
            let mut length=0u32;
            if (api().get_array_length)(env,*array,&mut length)!=0{return type_error(env,"Expected a normalized dash array");}
            let mut dash=Vec::with_capacity(length as usize);
            for index in 0..length {
                let mut item=ptr::null_mut();
                if (api().get_element)(env,*array,index,&mut item)!=0{return undefined(env);}
                let value=number(env,item);
                if !value.is_finite() || value<0.0{return undefined(env);}
                // Chrome stores dash segments as floats: 0.1 round-trips to
                // 0.10000000149011612 and 1e300 saturates at FLT_MAX.
                dash.push(canvas_float(value) as f64);
            }
            if dash.len()%2==1{let copy=dash.clone();dash.extend(copy);}
            canvas.line_dash=dash;
            undefined(env)
        }
        "save" => { canvas.state_stack.push(CanvasState{fill:canvas.fill.clone(),stroke:canvas.stroke.clone(),shadow:canvas.shadow.clone(),shadow_blur:canvas.shadow_blur,shadow_offset_x:canvas.shadow_offset_x,shadow_offset_y:canvas.shadow_offset_y,transform:canvas.transform,line_width:canvas.line_width,line_cap:canvas.line_cap.clone(),line_join:canvas.line_join.clone(),miter_limit:canvas.miter_limit,line_dash_offset:canvas.line_dash_offset,global_alpha:canvas.global_alpha,composite_mode:canvas.composite_mode,image_smoothing:canvas.image_smoothing,image_quality:canvas.image_quality.clone(),letter_spacing:canvas.letter_spacing.clone(),word_spacing:canvas.word_spacing.clone(),letter_spacing_from_font:canvas.letter_spacing_from_font,word_spacing_from_font:canvas.word_spacing_from_font,font_kerning:canvas.font_kerning.clone(),font_stretch:canvas.font_stretch.clone(),font_variant_caps:canvas.font_variant_caps.clone(),text_rendering:canvas.text_rendering.clone(),filter:canvas.filter.clone(),lang:canvas.lang.clone(),font:canvas.font.clone(),text_align:canvas.text_align.clone(),text_baseline:canvas.text_baseline.clone(),direction:canvas.direction.clone(),line_dash:canvas.line_dash.clone()}); if !canvas.native.is_null(){skia_canvas_save(canvas.native);} undefined(env) }
        "restore" => { let before=canvas.transform;if let Some(s)=canvas.state_stack.pop(){canvas.fill=s.fill;canvas.stroke=s.stroke;canvas.shadow=s.shadow;canvas.shadow_blur=s.shadow_blur;canvas.shadow_offset_x=s.shadow_offset_x;canvas.shadow_offset_y=s.shadow_offset_y;canvas.transform=s.transform;canvas.line_width=s.line_width;canvas.line_cap=s.line_cap;canvas.line_join=s.line_join;canvas.miter_limit=s.miter_limit;canvas.line_dash_offset=s.line_dash_offset;canvas.global_alpha=s.global_alpha;canvas.composite_mode=s.composite_mode;canvas.image_smoothing=s.image_smoothing;canvas.image_quality=s.image_quality;canvas.letter_spacing=s.letter_spacing;canvas.word_spacing=s.word_spacing;canvas.letter_spacing_from_font=s.letter_spacing_from_font;canvas.word_spacing_from_font=s.word_spacing_from_font;canvas.font_kerning=s.font_kerning;canvas.font_stretch=s.font_stretch;canvas.font_variant_caps=s.font_variant_caps;canvas.text_rendering=s.text_rendering;canvas.filter=s.filter;canvas.lang=s.lang;canvas.font=s.font;canvas.text_align=s.text_align;canvas.text_baseline=s.text_baseline;canvas.direction=s.direction;canvas.line_dash=s.line_dash;} if !canvas.native.is_null(){skia_canvas_restore(canvas.native,before.as_ptr(),canvas.transform.as_ptr());} undefined(env) }
        "fillText" | "strokeText" => {
            if args.len()<3{return type_error(env,"Text drawing requires text, x and y");}
            let text=value_string(env,args[0]).unwrap_or_default();
            let mut font=font_spec(&canvas.font);
            font.small_caps=(canvas.font_variant_caps!="normal") as i32;
            sync_native_text(canvas,&font);
            let mut x=number(env,args[1]);let y=number(env,args[2])+text_baseline_offset(canvas,&font);
            if !x.is_finite()||!y.is_finite()||text.is_empty(){return undefined(env);}
            let width={skia_canvas_measure_text(text_context(canvas),text.as_ptr(),text.len() as u32,font.family.as_ptr(),font.size as f32,font.weight,font.slant,font.small_caps) as f64};
            let mut draw_width=width;
            if let Some(max)=args.get(3){
                let mut value_type=0;
                (api().type_of)(env,*max,&mut value_type);
                // Optional Web IDL arguments treat undefined as omitted.
                if value_type!=0{
                    let max=number(env,*max);
                    if !max.is_finite()||max<=0.0{return undefined(env);}
                    draw_width=width.min(max);
                }
            }
            x-=text_align_offset(canvas,draw_width);
            sync_native_paint(canvas);
            if !canvas.native.is_null(){
                let horizontal_scale=if draw_width<width{(draw_width/width) as f32}else{1.0};
                skia_canvas_draw_text(canvas.native,text.as_ptr(),text.len() as u32,font.family.as_ptr(),x as f32,y as f32,font.size as f32,(name=="strokeText") as i32,font.weight,font.slant,font.small_caps,horizontal_scale);
            }
            undefined(env)
        }
        "getTransform" => { let mut o=ptr::null_mut(); (api().create_object)(env,&mut o); for (n,v) in [("a",canvas.transform[0]),("b",canvas.transform[1]),("c",canvas.transform[2]),("d",canvas.transform[3]),("e",canvas.transform[4]),("f",canvas.transform[5])] { set(env,o,n,number_value(env,v)); } o }
        "measureText" => {
            let mut o=ptr::null_mut(); (api().create_object)(env,&mut o);
            let text=args.first().and_then(|v|value_string(env,*v)).unwrap_or_default();
            let mut font=font_spec(&canvas.font);
            font.small_caps=(canvas.font_variant_caps!="normal") as i32;
            sync_native_text(canvas,&font);
            let width={skia_canvas_measure_text(text_context(canvas),text.as_ptr(),text.len() as u32,font.family.as_ptr(),font.size as f32,font.weight,font.slant,font.small_caps) as f64};
            set(env,o,"width",number_value(env,width));
            let (ascent,descent)=text_font_metrics(canvas,&font);
            let mut bounds=[0.0f32;4];
            if !text.is_empty(){skia_canvas_text_bounds(text_context(canvas),text.as_ptr(),text.len() as u32,font.family.as_ptr(),font.size as f32,font.weight,font.slant,bounds.as_mut_ptr(),font.small_caps);}

            let align=text_align_offset(canvas,width);
            let baseline=text_baseline_offset(canvas,&font);
            let hanging=ascent * 80.0f32 / 100.0f32;
            let baseline_float=baseline as f32;
            for (name,value) in [("fontBoundingBoxAscent",ascent-baseline_float),("fontBoundingBoxDescent",descent+baseline_float),("hangingBaseline",hanging-baseline_float),("alphabeticBaseline",-baseline_float),("ideographicBaseline",-descent-baseline_float)] {set(env,o,name,number_value(env,if value==0.0{0.0}else{value as f64}));}
            for (name,value) in [("actualBoundingBoxLeft",align-bounds[0] as f64),("actualBoundingBoxRight",bounds[2] as f64-align),("actualBoundingBoxAscent",-(bounds[1] as f64)-baseline),("actualBoundingBoxDescent",bounds[3] as f64+baseline)]{set(env,o,name,number_value(env,if value==0.0{0.0}else{value}));}
            o
        }
        "getImageData" => {
            let color_space=string_option(env,args.get(4).copied(),"colorSpace",if canvas.color_space{"display-p3"}else{"srgb"})=="display-p3";
            let float16=string_option(env,args.get(4).copied(),"pixelFormat","rgba-unorm8")=="rgba-float16";
            if args.len() < 4 { return type_error(env,"getImageData requires four arguments"); }
            let Some(mut x)=webidl_long(env,args[0]) else{return undefined(env);};
            let Some(mut y)=webidl_long(env,args[1]) else{return undefined(env);};
            let Some(mut width)=webidl_long(env,args[2]) else{return undefined(env);};
            let Some(mut height)=webidl_long(env,args[3]) else{return undefined(env);};
            if width==0 || height==0 {return dom_error(env,"IndexSizeError","Image dimensions must be nonzero");}
            if !(i32::MIN as i64..=i32::MAX as i64).contains(&(x+width)) || !(i32::MIN as i64..=i32::MAX as i64).contains(&(y+height)) {return dom_error(env,"RangeError","Image rectangle exceeds signed integer range");}
            if width<0{x+=width;width=-width;}if height<0{y+=height;height=-height;}
            let (x,y)=(x as isize,y as isize);let (width,height)=(width as usize,height as usize);
            let Some(length)=width.checked_mul(height).and_then(|n|n.checked_mul(if float16{8}else{4})) else{return dom_error(env,"RangeError","Image allocation is too large");};
            let mut pixels=Vec::new();
            if pixels.try_reserve_exact(length).is_err(){return dom_error(env,"RangeError","Image allocation failed");}
            pixels.resize(length,0);
            if canvas.native.is_null() && canvas.width>0 && canvas.height>0 {canvas.context_lost=true;}
            if !canvas.native.is_null() {
                skia_canvas_read(canvas.native, x.clamp(i32::MIN as isize, i32::MAX as isize) as i32,
                                 y.clamp(i32::MIN as isize, i32::MAX as isize) as i32,
                                 width.min(u32::MAX as usize) as u32, height.min(u32::MAX as usize) as u32,
                                 pixels.as_mut_ptr(),color_space as i32,float16 as i32);
                return image_data(env, width, height, &pixels,color_space,float16);
            }
            image_data(env, width, height, &pixels,color_space,float16)
        }
        "createImageData" => {
            let options=if args.len()==1{args.first().copied()}else{args.get(2).copied()};
            let color_space=string_option(env,options,"colorSpace",if canvas.color_space{"display-p3"}else{"srgb"})=="display-p3";
            let float16=string_option(env,options,"pixelFormat","rgba-unorm8")=="rgba-float16";
            let (width,height) = if args.len() >= 2 {
                let Some(w)=webidl_long(env,args[0]) else{return undefined(env);};
                let Some(h)=webidl_long(env,args[1]) else{return undefined(env);};
                (w.unsigned_abs() as usize,h.unsigned_abs() as usize)
            } else if let Some(source) = args.first() {
                let mut width_value=ptr::null_mut(); let mut height_value=ptr::null_mut();
                let wn=CString::new("width").unwrap(); let hn=CString::new("height").unwrap();
                if (api().get_named_property)(env,*source,wn.as_ptr(),&mut width_value)==0 && (api().get_named_property)(env,*source,hn.as_ptr(),&mut height_value)==0 {
                    (floor(number(env,width_value)).max(0) as usize, floor(number(env,height_value)).max(0) as usize)
                } else { return image_data(env,0,0,&[],false,false); }
            } else { return image_data(env, 0, 0, &[],false,false); };
            if width==0 || height==0{return dom_error(env,"IndexSizeError","Image dimensions must be nonzero");}
            let Some(length)=width.checked_mul(height).and_then(|n|n.checked_mul(if float16{8}else{4})) else{return dom_error(env,"RangeError","Image allocation is too large");};
            let mut pixels=Vec::new();
            if pixels.try_reserve_exact(length).is_err(){return dom_error(env,"RangeError","Image allocation failed");}
            pixels.resize(length,0);
            image_data(env, width, height, &pixels,color_space,float16)
        }
        "putImageData" => {
            if args.len() < 3 { return undefined(env); }
            let color_space=string_option(env,args.first().copied(),"colorSpace","srgb")=="display-p3";
            let float16=string_option(env,args.first().copied(),"pixelFormat","rgba-unorm8")=="rgba-float16";
            let stride=if float16{8}else{4};
            let mut data = ptr::null_mut();
            let data_name = CString::new("data").unwrap();
            let width_name = CString::new("width").unwrap();
            let height_name = CString::new("height").unwrap();
            if (api().get_named_property)(env, args[0], data_name.as_ptr(), &mut data) != 0 { return undefined(env); }
            let mut source_width = ptr::null_mut(); let mut source_height = ptr::null_mut();
            (api().get_named_property)(env, args[0], width_name.as_ptr(), &mut source_width);
            (api().get_named_property)(env, args[0], height_name.as_ptr(), &mut source_height);
            let mut width = 0u32; let mut height = 0u32;
            (api().get_value_uint32)(env, source_width, &mut width); (api().get_value_uint32)(env, source_height, &mut height);
            let mut kind = 0i32; let mut length = 0usize; let mut source = ptr::null_mut(); let mut buffer = ptr::null_mut(); let mut offset = 0usize;
            if (api().get_typedarray_info)(env, data, &mut kind, &mut length, &mut source, &mut buffer, &mut offset) != 0 || source.is_null() { return undefined(env); }
            let Some(x)=webidl_long(env,args[1]) else{return undefined(env);};
            let Some(y)=webidl_long(env,args[2]) else{return undefined(env);};
            let mut dest_x=x as isize;let mut dest_y=y as isize;
            let source = std::slice::from_raw_parts(source as *const u8, length);
            if length < width as usize * height as usize * stride { return undefined(env); }
            let mut write_x = 0usize; let mut write_y = 0usize;
            let mut write_width = width as usize; let mut write_height = height as usize;
            if args.len() >= 7 {
                let Some(x)=webidl_long(env,args[3]) else{return undefined(env);};
                let Some(y)=webidl_long(env,args[4]) else{return undefined(env);};
                let Some(w)=webidl_long(env,args[5]) else{return undefined(env);};
                let Some(h)=webidl_long(env,args[6]) else{return undefined(env);};
                let (mut dirty_x,mut dirty_y,mut dirty_width,mut dirty_height)=(x as isize,y as isize,w as isize,h as isize);
                if dirty_width<0{dirty_x+=dirty_width;dirty_width=-dirty_width;}
                if dirty_height<0{dirty_y+=dirty_height;dirty_height=-dirty_height;}
                if dirty_width==0 || dirty_height==0{return undefined(env);}
                let left = dirty_x.max(0).min(width as isize);
                let top = dirty_y.max(0).min(height as isize);
                let right = dirty_x.saturating_add(dirty_width).max(0).min(width as isize);
                let bottom = dirty_y.saturating_add(dirty_height).max(0).min(height as isize);
                if right <= left || bottom <= top { return undefined(env); }
                write_x = left as usize; write_y = top as usize;
                write_width = (right - left) as usize; write_height = (bottom - top) as usize;
                dest_x = dest_x.saturating_add(left); dest_y = dest_y.saturating_add(top);
            }
            if !canvas.native.is_null() {
                if write_x == 0 && write_y == 0 && write_width == width as usize && write_height == height as usize {
                    skia_canvas_write(canvas.native, source.as_ptr(), width, height,
                                      dest_x.clamp(i32::MIN as isize, i32::MAX as isize) as i32,
                                      dest_y.clamp(i32::MIN as isize, i32::MAX as isize) as i32,color_space as i32,float16 as i32);
                } else {
                    let mut cropped = vec![0u8; write_width * write_height * stride];
                    for row in 0..write_height {
                        let from = ((write_y + row) * width as usize + write_x) * stride;
                        let to = row * write_width * stride;
                        cropped[to..to + write_width * stride].copy_from_slice(&source[from..from + write_width * stride]);
                    }
                    skia_canvas_write(canvas.native, cropped.as_ptr(), write_width as u32, write_height as u32,
                                  dest_x.clamp(i32::MIN as isize, i32::MAX as isize) as i32,
                                  dest_y.clamp(i32::MIN as isize, i32::MAX as isize) as i32,color_space as i32,float16 as i32);
                }
                return undefined(env);
            }
            undefined(env)
        }
        "_fillPath" | "_strokePath" | "_clipPath" => {
            let Some(path) = args.first().and_then(|v| path_from(env, *v)) else {
                return type_error(env, "Expected a Path2D");
            };
            if canvas.native.is_null() { return undefined(env); }
            let evenodd = truthy(env, args.get(1)) as i32;
            sync_native_paint(canvas);
            match name {
                "_fillPath" => skia_canvas_fill_path(canvas.native, path, evenodd),
                "_strokePath" => skia_canvas_stroke_path(canvas.native, path),
                _ => skia_canvas_clip_path(canvas.native, path, evenodd),
            }
            undefined(env)
        }
        "_pointInPath" => {
            let Some(path) = args.first().and_then(|v| path_from(env, *v)) else {
                return type_error(env, "Expected a Path2D");
            };
            if canvas.native.is_null() { return boolean(env, false); }
            let x = args.get(1).map(|v| number(env, *v)).unwrap_or(f64::NAN);
            let y = args.get(2).map(|v| number(env, *v)).unwrap_or(f64::NAN);
            if !x.is_finite() || !y.is_finite() { return boolean(env, false); }
            let stroke = truthy(env, args.get(3));
            if stroke { sync_native_paint(canvas); }
            let evenodd = truthy(env, args.get(4)) as i32;
            boolean(env, skia_canvas_point_in_explicit_path(canvas.native, path, x as f32, y as f32,
                                                            stroke as i32, evenodd) != 0)
        }
        "reset" => { reset_canvas_state(canvas,true); undefined(env) }
        "_resize" => {
            if args.len()<2{return type_error(env,"resize requires dimensions");}
            let width=number(env,args[0]) as usize;let height=number(env,args[1]) as usize;
            let next=if canvas.context_lost{ptr::null_mut()}else{skia_canvas_create(width as u32,height as u32,canvas.alpha as i32,canvas.color_space as i32,canvas.float16 as i32)};
            skia_canvas_set_text_cache(next,canvas.text_cache.native);
            if !canvas.native.is_null(){skia_canvas_destroy(canvas.native);}
            canvas.native=next;canvas.width=width;canvas.height=height;
            reset_canvas_state(canvas,false);undefined(env)
        }
        "_clearBitmap" => {if !canvas.native.is_null(){skia_canvas_clear_bitmap(canvas.native);}undefined(env)}
        "getContextAttributes" => {
            let mut o=ptr::null_mut();(api().create_object)(env,&mut o);
            for (name,value) in [("alpha",canvas.alpha),("desynchronized",canvas.desynchronized),("willReadFrequently",canvas.will_read_frequently)] {dictionary_set(env,o,name,boolean(env,value));}
            dictionary_set(env,o,"colorSpace",string(env,if canvas.color_space{"display-p3"}else{"srgb"}));dictionary_set(env,o,"colorType",string(env,if canvas.float16{"float16"}else{"unorm8"}));
            let mut tone=ptr::null_mut();(api().create_object)(env,&mut tone);dictionary_set(env,tone,"mode",string(env,"standard"));dictionary_set(env,o,"toneMapping",tone);o
        }
        "isContextLost" => boolean(env, canvas.context_lost),
        "_ensureBitmap" => boolean(env, !canvas.native.is_null()),
        "isPointInPath" | "isPointInStroke" => {
            if args.len() < 2 || canvas.native.is_null() { return boolean(env, false); }
            if name == "isPointInStroke" { sync_native_paint(canvas); }
            let evenodd = name == "isPointInPath" && args.get(2).and_then(|value|value_string(env,*value)).as_deref() == Some("evenodd");
            boolean(env, skia_canvas_point_in_path(canvas.native, number(env,args[0]) as f32,
                number(env,args[1]) as f32, (name == "isPointInStroke") as i32, evenodd as i32) != 0)
        },
        "getLineDash" => { let mut result = ptr::null_mut(); (api().create_array_with_length)(env, canvas.line_dash.len(), &mut result); for (index, value) in canvas.line_dash.iter().enumerate() { (api().set_element)(env, result, index as u32, number_value(env, *value)); } result }
        "clip" => { let evenodd=args.first().and_then(|value|value_string(env,*value)).as_deref()==Some("evenodd"); if !canvas.native.is_null(){skia_canvas_clip(canvas.native,evenodd as i32);} undefined(env) }
        _ => undefined(env),
    }
}

unsafe fn create_context(env: NapiEnv, version: u32) -> NapiValue {
    let mut object = ptr::null_mut();
    (api().create_object)(env, &mut object);
    let context = Box::new(Context { version, error: 0, clear_color: [0.0,0.0,0.0,0.0], viewport: [0,0,300,150], color: vec![0;300*150*4], enabled: Vec::new() });
    (api().wrap)(env, object, Box::into_raw(context) as *mut c_void, Some(finalize_context), ptr::null_mut(), ptr::null_mut());
    for &(name, value) in CONSTANTS {
        set(env, object, name, uint32(env, value));
    }
    for (index, name) in METHODS.iter().enumerate() {
        if version == 1 && !WEBGL1_METHODS.contains(name) {
            continue;
        }
        let mut function = ptr::null_mut();
        let name_c = CString::new(*name).unwrap();
        (api().create_function)(env, name_c.as_ptr(), name.len(), context_method, index as *mut c_void, &mut function);
        set(env, object, name, function);
    }
    set(env, object, "drawingBufferWidth", uint32(env, 300));
    set(env, object, "drawingBufferHeight", uint32(env, 150));
    object
}

unsafe extern "C" fn context_method(env: NapiEnv, info: NapiCallbackInfo) -> NapiValue {
    let (args, this_arg, index) = callback_info(env, info);
    let name = METHODS.get(index).copied().unwrap_or("");
    let context = context_from(env, this_arg);
    match name {
        "getError" => {
            let value = context.map(|ctx| std::mem::take(&mut ctx.error)).unwrap_or(0);
            uint32(env, value)
        }
        "isContextLost" | "isBuffer" | "isFramebuffer" | "isProgram" | "isQuery" |
        "isRenderbuffer" | "isSampler" | "isShader" | "isSync" | "isTexture" | "isTransformFeedback" |
        "isVertexArray" => boolean(env, false),
        "isEnabled" => { let mut p=0; if let Some(a)=args.first(){(api().get_value_uint32)(env,*a,&mut p);} boolean(env,context.map(|c|c.enabled.contains(&p)).unwrap_or(false)) }
        "enable" => { if let (Some(c),Some(a))=(context,args.first()){let mut p=0;(api().get_value_uint32)(env,*a,&mut p);if !c.enabled.contains(&p){c.enabled.push(p);}} undefined(env) }
        "disable" => { if let (Some(c),Some(a))=(context,args.first()){let mut p=0;(api().get_value_uint32)(env,*a,&mut p);c.enabled.retain(|v|*v!=p);} undefined(env) }
        "clearColor" => { if let Some(c)=context { for i in 0..4 { if let Some(a)=args.get(i){c.clear_color[i]=number(env,*a).clamp(0.0,1.0);} } } undefined(env) }
        "clear" => { if let Some(c)=context { for px in c.color.chunks_exact_mut(4){for i in 0..4{px[i]=(c.clear_color[i]*255.0).round() as u8;}} } undefined(env) }
        "viewport" => { if let Some(c)=context { for i in 0..4 { if let Some(a)=args.get(i){let mut v=0;(api().get_value_uint32)(env,*a,&mut v);c.viewport[i]=v as i32;} } } undefined(env) }
        "readPixels" => { if let Some(c)=context { if args.len()>=7 { let mut w=0u32;let mut h=0u32;(api().get_value_uint32)(env,args[2],&mut w);(api().get_value_uint32)(env,args[3],&mut h); let mut kind=0;let mut len=0;let mut ptrv=ptr::null_mut();let mut buf=ptr::null_mut();let mut off=0;(api().get_typedarray_info)(env,args[6],&mut kind,&mut len,&mut ptrv,&mut buf,&mut off);if !ptrv.is_null(){let out=std::slice::from_raw_parts_mut(ptrv as *mut u8,len);for y in 0..h as usize{for x in 0..w as usize{let si=(y.min(149)*300+x.min(299))*4;let di=(y*w as usize+x)*4;if di+4<=out.len(){out[di..di+4].copy_from_slice(&c.color[si..si+4]);}}}} } } undefined(env) }
        "getContextAttributes" => {
            let mut attributes = ptr::null_mut();
            (api().create_object)(env, &mut attributes);
            for name in ["alpha", "antialias", "depth", "premultipliedAlpha"] {
                set(env, attributes, name, boolean(env, true));
            }
            for name in ["desynchronized", "failIfMajorPerformanceCaveat", "preserveDrawingBuffer", "stencil", "xrCompatible"] {
                set(env, attributes, name, boolean(env, false));
            }
            set(env, attributes, "powerPreference", string(env, "default"));
            attributes
        }
        "getSupportedExtensions" => {
            let mut result = ptr::null_mut();
            (api().create_array_with_length)(env, 0, &mut result);
            result
        }
        "getParameter" => {
            let mut pname = 0;
            if let Some(value) = args.first() {
                (api().get_value_uint32)(env, *value, &mut pname);
            }
            match pname {
                0x1F02 => string(env, if context.map(|ctx| ctx.version).unwrap_or(1) == 2 { "WebGL 2.0 (Rust compatibility layer)" } else { "WebGL 1.0 (Rust compatibility layer)" }),
                0x1F00 => string(env, "WebKit"),
                0x1F01 => string(env, "WebKit WebGL"),
                0x8B8C => string(env, if context.map(|ctx| ctx.version).unwrap_or(1) == 2 { "WebGL GLSL ES 3.00" } else { "WebGL GLSL ES 1.0" }),
                0x0D33 => uint32(env, 16384),
                _ => uint32(env, 0),
            }
        }
        "checkFramebufferStatus" => uint32(env, 0x8CD5),
        "getAttribLocation" | "getFragDataLocation" => uint32(env, u32::MAX),
        value if value.starts_with("create") || value == "fenceSync" => {
            let mut handle = ptr::null_mut();
            (api().create_object)(env, &mut handle);
            handle
        }
        _ => undefined(env),
    }
}

unsafe extern "C" fn create_webgl_context(env: NapiEnv, info: NapiCallbackInfo) -> NapiValue {
    let (args, _, _) = callback_info(env, info);
    let mut version = 1;
    if let Some(value) = args.first() {
        let mut buffer = [0i8; 32];
        let mut length = 0usize;
        if (api().get_value_string_utf8)(env, *value, buffer.as_mut_ptr(), buffer.len(), &mut length) == 0 {
            let name = std::slice::from_raw_parts(buffer.as_ptr() as *const u8, length);
            if name == b"webgl2" { version = 2; }
        }
    }
    create_context(env, version)
}

unsafe extern "C" fn context_constructor(env: NapiEnv, info: NapiCallbackInfo) -> NapiValue {
    let (_, _, data) = callback_info(env, info);
    create_context(env, if data == 2 { 2 } else { 1 })
}

unsafe fn canvas(width: usize, height: usize, env: NapiEnv, host: CanvasHost) -> NapiValue {
    let mut object = ptr::null_mut();
    (api().create_object)(env, &mut object);
    (api().type_tag_object)(env,object,if host==CanvasHost::Html{&HTML_CANVAS_HOST_TAG}else{&OFFSCREEN_CANVAS_HOST_TAG});
    set(env, object, "width", uint32(env, width as u32));
    set(env, object, "height", uint32(env, height as u32));
    let methods: &[&str]=if host==CanvasHost::Html { &["getContext"] } else { &["getContext", "convertToBlob", "transferToImageBitmap"] };
    for (index, name) in methods.iter().enumerate() {
        let mut function = ptr::null_mut();
        let name_c = CString::new(*name).unwrap();
        (api().create_function)(env, name_c.as_ptr(), name.len(), canvas_method, host.callback(index) as *mut c_void, &mut function);
        set(env, object, name, function);
    }
    object
}

unsafe extern "C" fn canvas_method(env: NapiEnv, info: NapiCallbackInfo) -> NapiValue {
    let (args, this_arg, index) = callback_info(env, info);
    let host=CanvasHost::from_callback(index);
    let mut tagged=false;
    if (api().check_object_type_tag)(env,this_arg,if host==CanvasHost::Html{&HTML_CANVAS_HOST_TAG}else{&OFFSCREEN_CANVAS_HOST_TAG},&mut tagged)!=0 || !tagged {
        return type_error(env,"Illegal invocation");
    }
    if index & !HTML_HOST_BIT != 0 { return undefined(env); }
    let mut width_value = ptr::null_mut(); let mut height_value = ptr::null_mut();
    let width_name = CString::new("width").unwrap(); let height_name = CString::new("height").unwrap();
    (api().get_named_property)(env, this_arg, width_name.as_ptr(), &mut width_value);
    (api().get_named_property)(env, this_arg, height_name.as_ptr(), &mut height_value);
    let mut width = 300u32; let mut height = 150u32;
    (api().get_value_uint32)(env, width_value, &mut width);
    (api().get_value_uint32)(env, height_value, &mut height);
    match args.first().and_then(|value| value_string(env, *value)).as_deref() {
        Some("2d") => {
            let options = args.get(1).copied();
            canvas_2d(width as usize, height as usize, env, host, context_option(env, options, "alpha", true),
                context_option(env, options, "desynchronized", false), context_option(env, options, "willReadFrequently", false),
                string_option(env,options,"colorSpace","srgb")=="display-p3",string_option(env,options,"colorType","unorm8")=="float16")
        },
        Some("webgl") | Some("experimental-webgl") => create_context(env, 1),
        Some("webgl2") => create_context(env, 2),
        _ => ptr::null_mut(),
    }
}

unsafe extern "C" fn offscreen_canvas_constructor(env: NapiEnv, info: NapiCallbackInfo) -> NapiValue {
    let (args, _, _) = callback_info(env, info);
    let width = args.first().map(|value| number(env, *value).max(0.0) as usize).unwrap_or(300);
    let height = args.get(1).map(|value| number(env, *value).max(0.0) as usize).unwrap_or(150);
    canvas(width, height, env, CanvasHost::Offscreen)
}

unsafe extern "C" fn html_canvas_constructor(env: NapiEnv, info: NapiCallbackInfo) -> NapiValue {
    let (args, _, _) = callback_info(env, info);
    let width=args.first().map(|v|number(env,*v).max(0.0) as usize).unwrap_or(300);
    let height=args.get(1).map(|v|number(env,*v).max(0.0) as usize).unwrap_or(150);
    canvas(width,height,env,CanvasHost::Html)
}

unsafe extern "C" fn canvas_2d_constructor(env: NapiEnv, _: NapiCallbackInfo) -> NapiValue {
    type_error(env,"Illegal constructor")
}

// encodeImage(pixels, width, height, type, quality) -> Uint8Array | undefined
unsafe extern "C" fn encode_image(env: NapiEnv, info: NapiCallbackInfo) -> NapiValue {
    let (args, _, _) = callback_info(env, info);
    if args.len() < 4 { return type_error(env, "encodeImage requires pixels, width, height and a type"); }
    let mut kind = 0i32; let mut length = 0usize; let mut source = ptr::null_mut();
    let mut buffer = ptr::null_mut(); let mut offset = 0usize;
    if (api().get_typedarray_info)(env, args[0], &mut kind, &mut length, &mut source, &mut buffer, &mut offset) != 0
        || source.is_null() { return type_error(env, "Expected a pixel buffer"); }
    let mut width = 0u32; let mut height = 0u32;
    (api().get_value_uint32)(env, args[1], &mut width);
    (api().get_value_uint32)(env, args[2], &mut height);
    if width == 0 || height == 0 || length < width as usize * height as usize * 4 { return undefined(env); }
    let format = match value_string(env, args[3]).unwrap_or_default().as_str() {
        "image/jpeg" => 1, "image/webp" => 2, _ => 0,
    };
    let quality = args.get(4).map(|v| number(env, *v)).unwrap_or(f64::NAN) as f32;
    let mut out_length = 0usize;
    let encoded = skia_encode_image(source as *const u8, width, height, format, quality, &mut out_length);
    if encoded.is_null() { return undefined(env); }
    let bytes = std::slice::from_raw_parts(encoded, out_length);
    let mut data = ptr::null_mut(); let mut array_buffer = ptr::null_mut();
    (api().create_arraybuffer)(env, bytes.len(), &mut data, &mut array_buffer);
    if !data.is_null() && !bytes.is_empty() {
        ptr::copy_nonoverlapping(bytes.as_ptr(), data as *mut u8, bytes.len());
    }
    skia_buffer_free(encoded);
    let mut array = ptr::null_mut();
    // napi_uint8_array is 1 in the Node-API ABI.
    (api().create_typedarray)(env, 1, bytes.len(), array_buffer, 0, &mut array);
    array
}

// decodeImage(bytes) -> {width, height, data} | null
unsafe extern "C" fn decode_image(env: NapiEnv, info: NapiCallbackInfo) -> NapiValue {
    let (args, _, _) = callback_info(env, info);
    let Some(input) = args.first() else { return type_error(env, "decodeImage requires bytes"); };
    let mut kind = 0i32; let mut length = 0usize; let mut source = ptr::null_mut();
    let mut buffer = ptr::null_mut(); let mut offset = 0usize;
    if (api().get_typedarray_info)(env, *input, &mut kind, &mut length, &mut source, &mut buffer, &mut offset) != 0
        || source.is_null() { return type_error(env, "Expected encoded bytes"); }
    let mut width = 0u32; let mut height = 0u32;
    let pixels = skia_decode_image(source as *const u8, length, &mut width, &mut height);
    if pixels.is_null() || width == 0 || height == 0 { return undefined(env); }
    let bytes = std::slice::from_raw_parts(pixels, width as usize * height as usize * 4);
    let result = image_data(env, width as usize, height as usize, bytes, false, false);
    skia_buffer_free(pixels);
    result
}

// A Node-API function that forwards to a JavaScript implementation. Because the
// exposed function really is native, Function.prototype.toString reports
// "function name() { [native code] }" and no toString hook is needed anywhere.
struct ForwardTarget { env: NapiEnv, reference: *mut c_void, construct: bool, name: String }

unsafe extern "C" fn finalize_forward(_: NapiEnv, data: *mut c_void, _: *mut c_void) {
    let target = Box::from_raw(data as *mut ForwardTarget);
    (api().delete_reference)(target.env, target.reference);
}

unsafe extern "C" fn forward_call(env: NapiEnv, info: NapiCallbackInfo) -> NapiValue {
    let (args, this_arg, data) = callback_info(env, info);
    if data == 0 { return type_error(env, "Illegal invocation"); }
    let target = &*(data as *const ForwardTarget);
    let mut callee = ptr::null_mut();
    if (api().get_reference_value)(env, target.reference, &mut callee) != 0 || callee.is_null() {
        return type_error(env, "Illegal invocation");
    }
    if target.construct {
        let mut new_target = ptr::null_mut();
        (api().get_new_target)(env, info, &mut new_target);
        if new_target.is_null() {
            return type_error(env, &format!(
                "Failed to construct '{}': Please use the 'new' operator, this DOM object constructor cannot be called as a function.",
                target.name));
        }
        let mut result = ptr::null_mut();
        // A pending exception leaves result null, which propagates it.
        (api().new_instance)(env, callee, args.len(), args.as_ptr(), &mut result);
        return result;
    }
    let mut result = ptr::null_mut();
    (api().call_function)(env, this_arg, callee, args.len(), args.as_ptr(), &mut result);
    result
}

// nativeFunction(target, name, length, isConstructor)
unsafe extern "C" fn native_function(env: NapiEnv, info: NapiCallbackInfo) -> NapiValue {
    let (args, _, _) = callback_info(env, info);
    if args.len() < 2 { return type_error(env, "nativeFunction requires a target and a name"); }
    let mut kind = 0i32;
    (api().type_of)(env, args[0], &mut kind);
    // napi_function is 7 in the Node-API ABI.
    if kind != 7 { return type_error(env, "nativeFunction requires a function target"); }
    let Some(name) = value_string(env, args[1]) else { return type_error(env, "Invalid function name"); };
    let length = args.get(2).map(|v| number(env, *v)).unwrap_or(0.0);
    let construct = truthy(env, args.get(3));
    let mut reference = ptr::null_mut();
    if (api().create_reference)(env, args[0], 1, &mut reference) != 0 { return undefined(env); }
    let data = Box::into_raw(Box::new(ForwardTarget { env, reference, construct, name: name.clone() }));
    let Ok(name_c) = CString::new(name.as_str()) else { return type_error(env, "Invalid function name"); };
    let mut function = ptr::null_mut();
    (api().create_function)(env, name_c.as_ptr(), name.len(), forward_call, data as *mut c_void, &mut function);
    // Tie the reference lifetime to the wrapper so both are released together.
    (api().wrap)(env, function, data as *mut c_void, Some(finalize_forward), ptr::null_mut(), ptr::null_mut());
    // Node-API functions report length 0; a browser reports the Web IDL arity.
    let mut length_value = ptr::null_mut();
    (api().create_double)(env, if length.is_finite() && length >= 0.0 { length } else { 0.0 }, &mut length_value);
    let key = CString::new("length").unwrap();
    let descriptor = NapiPropertyDescriptor {
        utf8name: key.as_ptr(), name: ptr::null_mut(), method: None, getter: None, setter: None,
        value: length_value, attributes: 4, data: ptr::null_mut(),
    };
    (api().define_properties)(env, function, 1, &descriptor);
    function
}

unsafe extern "C" fn object_constructor(env: NapiEnv, _: NapiCallbackInfo) -> NapiValue {
    let mut object = ptr::null_mut();
    (api().create_object)(env, &mut object);
    object
}

unsafe fn install_object_constructors(env: NapiEnv, target: NapiValue) {
    for name in WEBGL_OBJECT_TYPES {
        let mut constructor = ptr::null_mut();
        let name_c = CString::new(*name).unwrap();
        (api().create_function)(env, name_c.as_ptr(), name.len(), object_constructor, ptr::null_mut(), &mut constructor);
        set(env, target, name, constructor);
    }
}

unsafe fn install_canvas_constructors(env: NapiEnv, target: NapiValue) {
    let mut canvas_constructor = ptr::null_mut();
    let mut context_constructor = ptr::null_mut();
    (api().create_function)(env, b"OffscreenCanvas\0".as_ptr() as *const c_char, 15, offscreen_canvas_constructor, ptr::null_mut(), &mut canvas_constructor);
    (api().create_function)(env, b"OffscreenCanvasRenderingContext2D\0".as_ptr() as *const c_char, 33, canvas_2d_constructor, ptr::null_mut(), &mut context_constructor);
    set(env, target, "OffscreenCanvas", canvas_constructor);
    set(env, target, "OffscreenCanvasRenderingContext2D", context_constructor);
    let mut html_constructor=ptr::null_mut();
    let mut html_context_constructor=ptr::null_mut();
    (api().create_function)(env,b"HTMLCanvasElement\0".as_ptr() as *const c_char,17,html_canvas_constructor,ptr::null_mut(),&mut html_constructor);
    (api().create_function)(env,b"CanvasRenderingContext2D\0".as_ptr() as *const c_char,24,canvas_2d_constructor,ptr::null_mut(),&mut html_context_constructor);
    set(env,target,"HTMLCanvasElement",html_constructor);
    set(env,target,"CanvasRenderingContext2D",html_context_constructor);
    let mut path2d=ptr::null_mut();
    (api().create_function)(env,b"Path2D\0".as_ptr() as *const c_char,6,path_constructor,ptr::null_mut(),&mut path2d);
    set(env,target,"Path2D",path2d);

}

unsafe extern "C" fn install_globals(env: NapiEnv, info: NapiCallbackInfo) -> NapiValue {
    let (args, _, _) = callback_info(env, info);
    let target = if let Some(value) = args.first() {
        *value
    } else {
        let mut global = ptr::null_mut();
        (api().get_global)(env, &mut global);
        global
    };
    let mut webgl1 = ptr::null_mut();
    let mut webgl2 = ptr::null_mut();
    (api().create_function)(env, b"WebGLRenderingContext\0".as_ptr() as *const c_char, 21, context_constructor, 1usize as *mut c_void, &mut webgl1);
    (api().create_function)(env, b"WebGL2RenderingContext\0".as_ptr() as *const c_char, 22, context_constructor, 2usize as *mut c_void, &mut webgl2);
    set(env, target, "WebGLRenderingContext", webgl1);
    set(env, target, "WebGL2RenderingContext", webgl2);
    install_object_constructors(env, target);
    install_canvas_constructors(env, target);
    target
}

#[no_mangle]
pub unsafe extern "C" fn napi_register_module_v1(env: NapiEnv, exports: NapiValue) -> NapiValue {
    load_napi();
    let mut create = ptr::null_mut();
    let mut install = ptr::null_mut();
    let mut webgl1 = ptr::null_mut();
    let mut webgl2 = ptr::null_mut();
    (api().create_function)(env, b"createWebGLContext\0".as_ptr() as *const c_char, 18, create_webgl_context, ptr::null_mut(), &mut create);
    (api().create_function)(env, b"installWebGLGlobals\0".as_ptr() as *const c_char, 18, install_globals, ptr::null_mut(), &mut install);
    (api().create_function)(env, b"WebGLRenderingContext\0".as_ptr() as *const c_char, 21, context_constructor, 1usize as *mut c_void, &mut webgl1);
    (api().create_function)(env, b"WebGL2RenderingContext\0".as_ptr() as *const c_char, 22, context_constructor, 2usize as *mut c_void, &mut webgl2);
    set(env, exports, "createWebGLContext", create);
    set(env, exports, "installWebGLGlobals", install);
    let mut encode = ptr::null_mut(); let mut decode = ptr::null_mut();
    (api().create_function)(env, b"encodeImage\0".as_ptr() as *const c_char, 11, encode_image, ptr::null_mut(), &mut encode);
    (api().create_function)(env, b"decodeImage\0".as_ptr() as *const c_char, 11, decode_image, ptr::null_mut(), &mut decode);
    set(env, exports, "encodeImage", encode);
    set(env, exports, "decodeImage", decode);
    unsafe extern "C" fn diagnostics(env: NapiEnv, _: NapiCallbackInfo) -> NapiValue {
        string(env, &std::ffi::CStr::from_ptr(skia_render_diagnostics()).to_string_lossy())
    }
    let mut diagnostics_fn = ptr::null_mut();
    (api().create_function)(env, b"getRenderDiagnostics\0".as_ptr() as *const c_char, 20, diagnostics, ptr::null_mut(), &mut diagnostics_fn);
    set(env, exports, "getRenderDiagnostics", diagnostics_fn);
    let mut forward = ptr::null_mut();
    (api().create_function)(env, b"nativeFunction\0".as_ptr() as *const c_char, 14, native_function, ptr::null_mut(), &mut forward);
    set(env, exports, "nativeFunction", forward);
    set(env, exports, "WebGLRenderingContext", webgl1);
    set(env, exports, "WebGL2RenderingContext", webgl2);
    install_object_constructors(env, exports);
    install_canvas_constructors(env, exports);
    let mut constants = ptr::null_mut();
    (api().create_object)(env, &mut constants);
    for &(name, value) in CONSTANTS { set(env, constants, name, uint32(env, value)); }
    set(env, exports, "constants", constants);
    #[cfg(feature = "bundled")]
    {
        let source = string(env, include_str!(concat!(env!("OUT_DIR"), "/canvas-bundle.js")));
        let mut factory = ptr::null_mut();
        if (api().run_script)(env, source, &mut factory) != 0 { return ptr::null_mut(); }
        let mut result = ptr::null_mut();
        if (api().call_function)(env, undefined(env), factory, 1, &exports, &mut result) != 0 { return ptr::null_mut(); }
        result
    }
    #[cfg(not(feature = "bundled"))]
    { exports }
}
