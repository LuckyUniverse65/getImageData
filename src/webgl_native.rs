use std::ffi::{c_char, c_void, CString};
use std::ptr;
use std::sync::OnceLock;
use std::rc::Rc;
use std::cell::RefCell;

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

#[link(name = "kernel32")]
extern "system" {
    fn GetModuleHandleW(name: *const u16) -> *mut c_void;
    fn GetProcAddress(module: *mut c_void, name: *const c_char) -> *mut c_void;
}

#[link(name = "skia_backend", kind = "static")]
extern "C" {
    fn skia_canvas_create(width: u32, height: u32) -> *mut c_void;
    fn skia_canvas_destroy(canvas: *mut c_void);
    fn skia_canvas_scale(canvas: *mut c_void, x: f32, y: f32);
    fn skia_canvas_translate(canvas: *mut c_void, x: f32, y: f32);
    fn skia_canvas_rotate(canvas: *mut c_void, radians: f32);
    fn skia_canvas_save(canvas: *mut c_void);
    fn skia_canvas_restore(canvas: *mut c_void);
    fn skia_canvas_set_transform(canvas: *mut c_void, a: f32, b: f32, c: f32, d: f32, e: f32, f: f32);
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
    fn skia_canvas_set_gradient(canvas: *mut c_void, stroke: i32, kind: i32, args: *const f32, positions: *const f32, colors: *const u8, count: u32);
    fn skia_canvas_set_pattern(canvas: *mut c_void, stroke: i32, pixels: *const u8, width: u32, height: u32, repeat_x: i32, repeat_y: i32);
    fn skia_canvas_set_shadow(canvas: *mut c_void, r: u8, g: u8, b: u8, a: u8, blur: f32, offset_x: f32, offset_y: f32);
    fn skia_canvas_set_line_width(canvas: *mut c_void, width: f32);
    fn skia_canvas_set_stroke_style(canvas: *mut c_void, cap: i32, join: i32, miter_limit: f32);
    fn skia_canvas_set_line_dash(canvas: *mut c_void, values: *const f32, count: u32, offset: f32);
    fn skia_canvas_set_global_alpha(canvas: *mut c_void, alpha: f32);
    fn skia_canvas_set_composite(canvas: *mut c_void, copy: i32);
    fn skia_canvas_draw_text(canvas: *mut c_void, text: *const u8, length: u32, family: *const c_char, x: f32, y: f32, size: f32, stroke: i32, weight: i32, slant: i32);
    fn skia_canvas_measure_text(canvas: *mut c_void, text: *const u8, length: u32, family: *const c_char, size: f32, weight: i32, slant: i32) -> f32;
    fn skia_canvas_font_metrics(canvas: *mut c_void, family: *const c_char, size: f32, weight: i32, slant: i32, ascent: *mut f32, descent: *mut f32);
    fn skia_canvas_reset(canvas: *mut c_void);
    fn skia_canvas_clear_bitmap(canvas: *mut c_void);
    fn skia_canvas_draw_rgba_image(canvas: *mut c_void, input: *const u8, image_width: u32, image_height: u32,
                                   sx: f32, sy: f32, sw: f32, sh: f32, dx: f32, dy: f32, dw: f32, dh: f32);
    fn skia_canvas_read(canvas: *mut c_void, x: i32, y: i32, width: u32, height: u32, output: *mut u8);
    fn skia_canvas_write(canvas: *mut c_void, input: *const u8, source_width: u32, source_height: u32, x: i32, y: i32);
}

struct Napi {
    create_reference: unsafe extern "C" fn(NapiEnv, NapiValue, u32, *mut *mut c_void) -> i32,
    get_reference_value: unsafe extern "C" fn(NapiEnv, *mut c_void, *mut NapiValue) -> i32,
    delete_reference: unsafe extern "C" fn(NapiEnv, *mut c_void) -> i32,
    coerce_to_number: unsafe extern "C" fn(NapiEnv, NapiValue, *mut NapiValue) -> i32,
    coerce_to_bool: unsafe extern "C" fn(NapiEnv, NapiValue, *mut NapiValue) -> i32,
    get_value_bool: unsafe extern "C" fn(NapiEnv, NapiValue, *mut bool) -> i32,
    new_instance: unsafe extern "C" fn(NapiEnv, NapiValue, usize, *const NapiValue, *mut NapiValue) -> i32,
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
            coerce_to_bool: symbol(module, b"napi_coerce_to_bool\0"),
            get_value_bool: symbol(module, b"napi_get_value_bool\0"),
            new_instance: symbol(module, b"napi_new_instance\0"),
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

struct Canvas2D {
    native: *mut c_void,
    width: usize,
    height: usize,
    // Retained only for zero-sized native allocation fallback; normal rendering
    // and image reads are performed by the Skia surface.
    pixels: Vec<u8>,
    fill: Style,
    stroke: Style,
    shadow: [u8; 4],
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
    composite_copy: bool,
    font: String,
    text_align: String,
    text_baseline: String,
    line_dash: Vec<f64>,
    state_stack: Vec<CanvasState>,
    clip: Vec<Vec<Path>>,
}

#[derive(Clone)]
struct CanvasState {
    fill: Style,
    stroke: Style,
    shadow: [u8; 4],
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
    composite_copy: bool,
    font: String,
    text_align: String,
    text_baseline: String,
    line_dash: Vec<f64>,
    clip: Vec<Vec<Path>>,
}

#[derive(Clone)]
enum Style {
    Color([u8; 4]),
    Gradient(Rc<GradientStyle>),
    Pattern(Pattern),
}

#[derive(Clone)]
struct Gradient {
    kind: u8,
    args: [f64; 6],
    stops: Vec<(f64, [u8; 4])>,
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
struct Pattern { pixels: Vec<u8>, width: u32, height: u32, repeat_x: bool, repeat_y: bool }
struct PatternObject(Pattern);

unsafe extern "C" fn finalize_gradient(_: NapiEnv, data: *mut c_void, _: *mut c_void) {
    drop(Box::from_raw(data as *mut GradientObject));
}
unsafe extern "C" fn finalize_pattern(_: NapiEnv, data: *mut c_void, _: *mut c_void) {
    drop(Box::from_raw(data as *mut PatternObject));
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
    let value = CString::new(value).unwrap();
    (api().create_string_utf8)(env, value.as_ptr(), value.as_bytes().len(), &mut result);
    result
}

unsafe fn number(env: NapiEnv, value: NapiValue) -> f64 {
    let mut result = 0.0;
    (api().get_value_double)(env, value, &mut result);
    result
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

unsafe fn callback_info(env: NapiEnv, info: NapiCallbackInfo) -> (Vec<NapiValue>, NapiValue, usize) {
    let mut argc = 8usize;
    let mut args = vec![ptr::null_mut(); argc];
    let mut this_arg = ptr::null_mut();
    let mut data = ptr::null_mut();
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

unsafe fn canvas_2d_from(env: NapiEnv, object: NapiValue) -> Option<&'static mut Canvas2D> {
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

unsafe fn image_data(env: NapiEnv, width: usize, height: usize, pixels: &[u8]) -> NapiValue {
    let mut result = ptr::null_mut();
    (api().create_object)(env, &mut result);
    set(env, result, "data", clamped_pixels(env, pixels));
    set(env, result, "width", uint32(env, width as u32));
    set(env, result, "height", uint32(env, height as u32));
    result
}

fn parse_color(value: &str) -> Option<[u8; 4]> {
    let value = value.trim().to_ascii_lowercase();
    let named = match value.as_str() {
        "black" => Some([0, 0, 0, 255]), "white" => Some([255, 255, 255, 255]),
        "red" => Some([255, 0, 0, 255]), "green" => Some([0, 128, 0, 255]),
        "blue" => Some([0, 0, 255, 255]), "transparent" => Some([0, 0, 0, 0]), _ => None,
    };
    if named.is_some() { return named; }
    if let Some(body) = value.strip_prefix("rgb(").and_then(|body| body.strip_suffix(')')) {
        let values: Vec<&str> = body.split(',').map(str::trim).collect();
        if values.len() == 3 {
            let channel = |part: &str| -> Option<u8> { if let Some(percent) = part.strip_suffix('%') { Some((percent.trim().parse::<f64>().ok()?.clamp(0.0, 100.0) * 2.55).round() as u8) } else { Some(part.parse::<f64>().ok()?.clamp(0.0, 255.0).round() as u8) } };
            return Some([channel(values[0])?, channel(values[1])?, channel(values[2])?, 255]);
        }
    }
    if let Some(body) = value.strip_prefix("rgba(").and_then(|body| body.strip_suffix(')')) {
        let values: Vec<&str> = body.split(',').map(str::trim).collect();
        if values.len() == 4 {
            let channel = |part: &str| -> Option<u8> { if let Some(percent) = part.strip_suffix('%') { Some((percent.trim().parse::<f64>().ok()?.clamp(0.0, 100.0) * 2.55).round() as u8) } else { Some(part.parse::<f64>().ok()?.clamp(0.0, 255.0).round() as u8) } };
            let alpha = if let Some(percent) = values[3].strip_suffix('%') { (percent.trim().parse::<f64>().ok()?.clamp(0.0, 100.0) * 2.55).round() as u8 } else { (values[3].parse::<f64>().ok()?.clamp(0.0, 1.0) * 255.0).round() as u8 };
            return Some([channel(values[0])?, channel(values[1])?, channel(values[2])?, alpha]);
        }
    }
    let hex = value.strip_prefix('#')?;
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
    "_resize", "_clearBitmap",
    "arc", "arcTo", "beginPath", "bezierCurveTo", "clearRect", "clip", "closePath",
    "createConicGradient", "createImageData", "createLinearGradient", "createPattern",
    "createRadialGradient", "drawImage", "ellipse", "fill", "fillRect", "fillText",
    "getContextAttributes", "getImageData", "getLineDash", "getTransform", "isContextLost",
    "isPointInPath", "isPointInStroke", "lineTo", "measureText", "moveTo", "putImageData",
    "quadraticCurveTo", "rect", "reset", "resetTransform", "restore", "rotate", "roundRect",
    "save", "scale", "setLineDash", "setTransform", "stroke", "strokeRect", "strokeText",
    "transform", "translate",
];

unsafe fn canvas_2d(width: usize, height: usize, env: NapiEnv) -> NapiValue {
    let mut object = ptr::null_mut();
    (api().create_object)(env, &mut object);
    let length = width.saturating_mul(height).saturating_mul(4);
    let data = Box::new(Canvas2D {
        native: skia_canvas_create(width.min(u32::MAX as usize) as u32, height.min(u32::MAX as usize) as u32),
        width, height, pixels: vec![0; length], fill: Style::Color([0, 0, 0, 255]),
        stroke: Style::Color([0, 0, 0, 255]), shadow: [0, 0, 0, 0], shadow_blur: 0.0, shadow_offset_x: 0.0, shadow_offset_y: 0.0,
        transform: [1.0, 0.0, 0.0, 1.0, 0.0, 0.0], path: Vec::new(), current_path: None,
        line_width: 1.0, line_cap: "butt".to_string(), line_join: "miter".to_string(), miter_limit: 10.0, line_dash_offset: 0.0, global_alpha: 1.0, composite_copy: false,
        font: "10px sans-serif".to_string(), text_align: "start".to_string(),
        text_baseline: "alphabetic".to_string(), line_dash: Vec::new(),
        state_stack: Vec::new(), clip: Vec::new(),
    });
    (api().wrap)(env, object, Box::into_raw(data) as *mut c_void, Some(finalize_canvas_2d), ptr::null_mut(), ptr::null_mut());
    for (index, name) in CANVAS_2D_METHODS.iter().enumerate() {
        let mut function = ptr::null_mut();
        let name_c = CString::new(*name).unwrap();
        (api().create_function)(env, name_c.as_ptr(), name.len(), canvas_2d_method, index as *mut c_void, &mut function);
        set(env, object, name, function);
    }
    let props = [
        ("fillStyle", 0usize), ("strokeStyle", 1), ("shadowColor", 2), ("shadowBlur", 3), ("shadowOffsetX", 10), ("shadowOffsetY", 11),
        ("lineWidth", 4), ("globalAlpha", 5), ("font", 6), ("textAlign", 7),
        ("textBaseline", 8), ("globalCompositeOperation", 9), ("lineCap", 12), ("lineJoin", 13), ("miterLimit", 14), ("lineDashOffset", 15),
    ];
    let descriptors: Vec<NapiPropertyDescriptor> = props.iter().map(|(name, index)| NapiPropertyDescriptor {
        utf8name: CString::new(*name).unwrap().into_raw(), name: ptr::null_mut(), method: None,
        getter: Some(get_canvas_property), setter: Some(set_canvas_property), value: ptr::null_mut(),
        attributes: 0, data: *index as *mut c_void,
    }).collect();
    (api().define_properties)(env, object, descriptors.len(), descriptors.as_ptr());
    object
}

fn floor(value: f64) -> isize { value.floor() as isize }

fn rectangle(x: f64, y: f64, width: f64, height: f64) -> (isize, isize, isize, isize) {
    let x1 = floor(x); let y1 = floor(y);
    let x2 = floor(x + width); let y2 = floor(y + height);
    (x1.min(x2), y1.min(y2), x1.max(x2), y1.max(y2))
}

fn style_color(style: &Style) -> [u8; 4] { match style { Style::Color(c) => *c, Style::Gradient(g) => g.data.borrow().stops.first().map(|s| s.1).unwrap_or([0,0,0,255]), Style::Pattern(_) => [0,0,0,255] } }

unsafe fn style_value(env: NapiEnv, style: &Style) -> NapiValue {
    if let Style::Gradient(g) = style {
        let mut value = ptr::null_mut();
        (api().get_reference_value)(env, g.reference, &mut value);
        return value;
    }
    let color = style_color(style);
    if color[3] == 255 { string(env, &format!("#{:02x}{:02x}{:02x}", color[0], color[1], color[2])) }
    else { string(env, &format!("rgba({}, {}, {}, {})", color[0], color[1], color[2], color[3] as f64 / 255.0)) }
}

// The JS-facing object and argument conversion remain in Rust.  Pixel generation is delegated
// to the linked Skia surface through this small C ABI boundary.
unsafe fn sync_native_style(canvas: &Canvas2D, style: &Style, stroke: bool) {
    if canvas.native.is_null() { return; }
    match style {
        Style::Color(color) => skia_canvas_set_color(canvas.native, stroke as i32, color[0], color[1], color[2], color[3]),
        Style::Gradient(gradient) => {
            let gradient = gradient.data.borrow();
            let args = gradient.args.map(|value| value as f32);
            let positions: Vec<f32> = gradient.stops.iter().map(|(position, _)| *position as f32).collect();
            let mut colors = Vec::with_capacity(gradient.stops.len() * 4);
            for (_, color) in &gradient.stops { colors.extend_from_slice(color); }
            skia_canvas_set_gradient(canvas.native, stroke as i32, gradient.kind as i32, args.as_ptr(),
                                     positions.as_ptr(), colors.as_ptr(), gradient.stops.len() as u32);
        },
        Style::Pattern(pattern) => skia_canvas_set_pattern(canvas.native, stroke as i32, pattern.pixels.as_ptr(), pattern.width, pattern.height, pattern.repeat_x as i32, pattern.repeat_y as i32),
    }
}

unsafe fn sync_native_paint(canvas: &Canvas2D) {
    if canvas.native.is_null() { return; }
    sync_native_style(canvas, &canvas.fill, false);
    sync_native_style(canvas, &canvas.stroke, true);
    skia_canvas_set_shadow(canvas.native, canvas.shadow[0], canvas.shadow[1], canvas.shadow[2], canvas.shadow[3], canvas.shadow_blur as f32, canvas.shadow_offset_x as f32, canvas.shadow_offset_y as f32);
    skia_canvas_set_line_width(canvas.native, canvas.line_width as f32);
    let cap = if canvas.line_cap == "round" { 1 } else if canvas.line_cap == "square" { 2 } else { 0 };
    let join = if canvas.line_join == "round" { 1 } else if canvas.line_join == "bevel" { 2 } else { 0 };
    skia_canvas_set_stroke_style(canvas.native, cap, join, canvas.miter_limit as f32);
    let dash: Vec<f32> = canvas.line_dash.iter().map(|value| *value as f32).collect();
    skia_canvas_set_line_dash(canvas.native, dash.as_ptr(), dash.len() as u32, canvas.line_dash_offset as f32);
    skia_canvas_set_global_alpha(canvas.native, canvas.global_alpha as f32);
    skia_canvas_set_composite(canvas.native, canvas.composite_copy as i32);
}

struct FontSpec { family: CString, size: f64, weight: i32, slant: i32 }

fn font_spec(value: &str) -> FontSpec {
    let lowercase = value.to_ascii_lowercase();
    let mut size = 10.0;
    let mut suffix = "";
    let mut prefix = "";
    for (index, _) in lowercase.match_indices("px") {
        let before = &value[..index];
        let token = before.split_whitespace().last().unwrap_or("").split('/').next().unwrap_or("");
        if let Ok(parsed) = token.parse::<f64>() {
            if parsed.is_finite() && parsed >= 0.0 { size = parsed; suffix = &value[index + 2..]; prefix = before; break; }
        }
    }
    let mut family = suffix.split(',').next().unwrap_or("").trim().trim_matches(|c| c == '\'' || c == '\"');
    if family.is_empty() { family = "Arial"; }
    let tokens: Vec<&str> = prefix.split_whitespace().collect();
    let slant = if tokens.iter().any(|token| token.eq_ignore_ascii_case("oblique")) { 2 }
                else if tokens.iter().any(|token| token.eq_ignore_ascii_case("italic")) { 1 } else { 0 };
    let weight = if tokens.iter().any(|token| token.eq_ignore_ascii_case("bold") || token.eq_ignore_ascii_case("bolder")) { 700 }
        else { tokens.iter().find_map(|token| token.parse::<i32>().ok()).filter(|weight| (100..=900).contains(weight)).unwrap_or(400) };
    FontSpec { family: CString::new(family).unwrap_or_else(|_| CString::new("Arial").unwrap()), size, weight, slant }
}

unsafe fn text_baseline_offset(canvas: &Canvas2D, font: &FontSpec) -> f64 {
    if canvas.native.is_null() || canvas.text_baseline == "alphabetic" { return 0.0; }
    let mut ascent = 0.0f32; let mut descent = 0.0f32;
    skia_canvas_font_metrics(canvas.native, font.family.as_ptr(), font.size as f32, font.weight, font.slant, &mut ascent, &mut descent);
    match canvas.text_baseline.as_str() {
        "top" => -ascent as f64,
        "hanging" => -(ascent as f64) * 0.8,
        "middle" => ((-ascent as f64) - descent as f64) / 2.0,
        "ideographic" | "bottom" => -(descent as f64),
        _ => 0.0,
    }
}

unsafe extern "C" fn get_canvas_property(env: NapiEnv, info: NapiCallbackInfo) -> NapiValue {
    let (_, this_arg, data) = callback_info(env, info);
    let Some(c) = canvas_2d_from(env, this_arg) else { return undefined(env); };
    match data {
        0 => style_value(env, &c.fill),
        1 => style_value(env, &c.stroke),
        2 => string(env, &format!("#{:02x}{:02x}{:02x}{:02x}", c.shadow[0], c.shadow[1], c.shadow[2], c.shadow[3])),
        3 => number_value(env, c.shadow_blur), 4 => number_value(env, c.line_width), 10 => number_value(env, c.shadow_offset_x), 11 => number_value(env, c.shadow_offset_y),
        5 => number_value(env, c.global_alpha), 6 => string(env, &c.font),
        7 => string(env, &c.text_align), 8 => string(env, &c.text_baseline),
        9 => string(env, if c.composite_copy { "copy" } else { "source-over" }), 12 => string(env, &c.line_cap), 13 => string(env, &c.line_join), 14 => number_value(env, c.miter_limit), 15 => number_value(env, c.line_dash_offset), _ => undefined(env)
    }
}

unsafe extern "C" fn set_canvas_property(env: NapiEnv, info: NapiCallbackInfo) -> NapiValue {
    let (args, this_arg, data) = callback_info(env, info);
    let Some(c) = canvas_2d_from(env, this_arg) else { return undefined(env); };
    let Some(value) = args.first() else { return undefined(env); };
    match data {
        0 | 1 => {
            if let Some(s) = value_string(env, *value) {
                if let Some(col) = parse_color(&s) { if data == 0 { c.fill = Style::Color(col); } else { c.stroke = Style::Color(col); } }
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
                        let p=&*(raw as *mut PatternObject); if data==0 {c.fill=Style::Pattern(p.0.clone());} else {c.stroke=Style::Pattern(p.0.clone());}
                    }
                }
            }
        },
        2 => if let Some(s) = value_string(env, *value) { if let Some(col) = parse_color(&s) { c.shadow = col; } },
        3 => { let n = number(env, *value); if n.is_finite() && n >= 0.0 { c.shadow_blur = n; } }, 4 => { let n = number(env, *value); if n.is_finite() && n > 0.0 { c.line_width = n; } },
        10 => { let n = number(env, *value); if n.is_finite() { c.shadow_offset_x = n; } }, 11 => { let n = number(env, *value); if n.is_finite() { c.shadow_offset_y = n; } },
        5 => {
            let mut converted = ptr::null_mut();
            if (api().coerce_to_number)(env, *value, &mut converted) != 0 { return undefined(env); }
            let n = number(env, converted);
            if n.is_finite() && (0.0..=1.0).contains(&n) { c.global_alpha = n; }
        },
        6 => if let Some(s) = value_string(env, *value) { c.font = s; },
        7 => if let Some(s) = value_string(env, *value) { if ["left", "right", "center", "start", "end"].contains(&s.as_str()) { c.text_align = s; } }, 8 => if let Some(s) = value_string(env, *value) { if ["top", "hanging", "middle", "alphabetic", "ideographic", "bottom"].contains(&s.as_str()) { c.text_baseline = s; } },
        9 => if let Some(s) = value_string(env, *value) { if s == "source-over" || s == "copy" { c.composite_copy = s == "copy"; } },
        12 => if let Some(s) = value_string(env, *value) { if ["butt", "round", "square"].contains(&s.as_str()) { c.line_cap = s; } },
        13 => if let Some(s) = value_string(env, *value) { if ["miter", "round", "bevel"].contains(&s.as_str()) { c.line_join = s; } },
        14 => { let n = number(env, *value); if n.is_finite() && n > 0.0 { c.miter_limit = n; } },
        15 => { let n = number(env, *value); if n.is_finite() { c.line_dash_offset = n; } }, _ => {}
    }
    undefined(env)
}

unsafe fn number_value(env: NapiEnv, value: f64) -> NapiValue {
    let mut result = ptr::null_mut();
    (api().create_double)(env, value, &mut result);
    result
}

unsafe fn fill_rectangle(canvas: &mut Canvas2D, x: f64, y: f64, width: f64, height: f64, color: [u8; 4]) {
    let (left, top, right, bottom) = rectangle(x, y, width, height);
    let start_x = left.max(0) as usize; let start_y = top.max(0) as usize;
    let end_x = right.max(0).min(canvas.width as isize) as usize;
    let end_y = bottom.max(0).min(canvas.height as isize) as usize;
    for row in start_y..end_y {
        for column in start_x..end_x {
            let index = (row * canvas.width + column) * 4;
            canvas.pixels[index..index + 4].copy_from_slice(&color);
        }
    }
}

fn tx(t: [f64; 6], x: f64, y: f64) -> (f64, f64) { (t[0]*x+t[2]*y+t[4], t[1]*x+t[3]*y+t[5]) }
fn style_at(style: &Style, x: f64, y: f64) -> [u8; 4] {
    match style {
        Style::Color(c) => *c,
        Style::Gradient(g) => {
            let g = g.data.borrow();
            if g.stops.is_empty() { return [0,0,0,0]; }
            let p = match g.kind {
                1 => { let dx=g.args[2]-g.args[0]; let dy=g.args[3]-g.args[1]; let d=dx*dx+dy*dy; if d==0.0 {1.0} else {((x-g.args[0])*dx+(y-g.args[1])*dy)/d} },
                2 => { let dx0=g.args[2]-g.args[0]; let dy0=g.args[3]-g.args[1]; let dr=g.args[5]-g.args[4]; let px=x-g.args[0]; let py=y-g.args[1]; let aa=dx0*dx0+dy0*dy0-dr*dr; let bb=-2.0*(px*dx0+py*dy0+g.args[4]*dr); let cc=px*px+py*py-g.args[4]*g.args[4]; if aa.abs()<1e-12 { if bb.abs()<1e-12 {1.0} else {-cc/bb} } else { let disc=bb*bb-4.0*aa*cc; if disc<0.0 {1.0} else { ((-bb-disc.sqrt())/(2.0*aa)).max((-bb+disc.sqrt())/(2.0*aa)) } } },
                _ => ((y-g.args[1]).atan2(x-g.args[0])-g.args[2])/(std::f64::consts::PI*2.0),
            };
            let mut p = p; if g.kind == 3 { p -= p.floor(); }
            let p = p.clamp(0.0,1.0);
            if p <= g.stops[0].0 { return g.stops[0].1; }
            for i in 1..g.stops.len() { if p <= g.stops[i].0 { let (a,ca)=g.stops[i-1]; let (b,cb)=g.stops[i]; let q=((p-a)/(b-a).max(1e-9)).clamp(0.0,1.0); return [0,1,2,3].map(|k| (ca[k] as f64+(cb[k] as f64-ca[k] as f64)*q).round() as u8); } }
            g.stops.last().unwrap().1
        },
        Style::Pattern(p) => if p.pixels.len() >= 4 && p.width > 0 && p.height > 0 { p.pixels[0..4].try_into().unwrap_or([0,0,0,0]) } else { [0,0,0,0] },
    }
}
fn clip_contains(c: &Canvas2D, x: f64, y: f64) -> bool {
    c.clip.iter().all(|paths| paths.iter().any(|p| p.points.len() >= 3 && inside(x, y, &p.points)))
}
fn blend(c: &mut Canvas2D, x: isize, y: isize, src: [u8;4], coverage: f64) {
    if x<0 || y<0 || x>=c.width as isize || y>=c.height as isize { return; }
    if !clip_contains(c, x as f64 + 0.5, y as f64 + 0.5) { return; }
    let a=(src[3] as f64/255.0*c.global_alpha*coverage).clamp(0.0,1.0); let i=(y as usize*c.width+x as usize)*4;
    if c.composite_copy { c.pixels[i..i+4].copy_from_slice(&[src[0],src[1],src[2],(a*255.0).round() as u8]); return; }
    let da=c.pixels[i+3] as f64/255.0; let oa=a+da*(1.0-a);
    if oa<=0.0 { c.pixels[i..i+4].fill(0); return; }
    for k in 0..3 { let dp=c.pixels[i+k] as f64/255.0*da; c.pixels[i+k]=((src[k] as f64/255.0*a+dp*(1.0-a))/oa*255.0).round() as u8; }
    c.pixels[i+3]=(oa*255.0).round() as u8;
}
fn inside(x:f64,y:f64,p:&[(f64,f64)]) -> bool { let mut hit=false; for i in 0..p.len() { let j=(i+p.len()-1)%p.len(); let (xi,yi)=p[i]; let (xj,yj)=p[j]; if (yi>y)!=(yj>y) && x < (xj-xi)*(y-yi)/(yj-yi)+xi { hit=!hit; } } hit }
fn raster(c:&mut Canvas2D, paths:&[Path], style:&Style, stroke:bool) {
    for path in paths { if path.points.len()<2 {continue;} let (minx,maxx)=(path.points.iter().map(|p|p.0).fold(f64::INFINITY,f64::min).floor() as isize,path.points.iter().map(|p|p.0).fold(f64::NEG_INFINITY,f64::max).ceil() as isize); let (miny,maxy)=(path.points.iter().map(|p|p.1).fold(f64::INFINITY,f64::min).floor() as isize,path.points.iter().map(|p|p.1).fold(f64::NEG_INFINITY,f64::max).ceil() as isize);
        for y in miny..maxy { for x in minx..maxx { let mut cov=0; for sy in 0..8 { for sx in 0..8 { let px=x as f64+(sx as f64+0.5)/8.0; let py=y as f64+(sy as f64+0.5)/8.0; let hit=if stroke { let mut h=false; let end = if path.closed { path.points.len() } else { path.points.len().saturating_sub(1) }; for i in 1..=end { let j=i % path.points.len(); let (ax,ay)=path.points[i-1]; let (bx,by)=path.points[j]; let dx=bx-ax; let dy=by-ay; let q=((px-ax)*dx+(py-ay)*dy)/(dx*dx+dy*dy).max(1e-9); let t=q.clamp(0.0,1.0); if ((px-(ax+t*dx)).powi(2)+(py-(ay+t*dy)).powi(2)).sqrt()<=c.line_width/2.0 {h=true;break;} } h } else {inside(px,py,&path.points)}; if hit {cov+=1;} } } if cov>0 { blend(c,x,y,style_at(style,x as f64+0.5,y as f64+0.5),cov as f64/64.0); } } }
    }
}
fn offset_paths(paths:&[Path],dx:f64,dy:f64)->Vec<Path>{ paths.iter().map(|p|Path{points:p.points.iter().map(|(x,y)|(x+dx,y+dy)).collect(),closed:p.closed}).collect() }

fn shadow_paths(c: &mut Canvas2D, paths: &[Path], stroke: bool) {
    if c.shadow[3] == 0 || c.shadow_blur <= 0.0 { return; }
    let radius = c.shadow_blur.ceil().min(64.0) as isize;
    let mut tmp = c.clone_for_raster();
    tmp.pixels.fill(0);
    tmp.shadow = [0, 0, 0, 0];
    tmp.global_alpha = c.global_alpha;
    raster(&mut tmp, paths, &Style::Color(c.shadow), stroke);
    if radius == 0 { return; }
    let mut blurred = vec![0u8; tmp.pixels.len()];
    let w = c.width as isize;
    let h = c.height as isize;
    for y in 0..h { for x in 0..w {
        let mut sum = 0u32; let mut count = 0u32;
        for yy in (y-radius).max(0)..=(y+radius).min(h-1) { for xx in (x-radius).max(0)..=(x+radius).min(w-1) {
            sum += tmp.pixels[(yy as usize*c.width+xx as usize)*4+3] as u32; count += 1;
        }}
        let i=(y as usize*c.width+x as usize)*4;
        let a=(sum / count.max(1)) as u8;
        blurred[i..i+4].copy_from_slice(&[c.shadow[0],c.shadow[1],c.shadow[2],a]);
    }}
    for y in 0..h { for x in 0..w { let i=(y as usize*c.width+x as usize)*4; if blurred[i+3] > 0 { blend(c,x,y,[blurred[i],blurred[i+1],blurred[i+2],blurred[i+3]],1.0); } } }
}

impl Canvas2D {
    fn clone_for_raster(&self) -> Canvas2D {
        Canvas2D { native:ptr::null_mut(),width:self.width,height:self.height,pixels:self.pixels.clone(),fill:self.fill.clone(),stroke:self.stroke.clone(),shadow:self.shadow,shadow_blur:self.shadow_blur,shadow_offset_x:self.shadow_offset_x,shadow_offset_y:self.shadow_offset_y,transform:self.transform,path:self.path.clone(),current_path:self.current_path,line_width:self.line_width,line_cap:self.line_cap.clone(),line_join:self.line_join.clone(),miter_limit:self.miter_limit,line_dash_offset:self.line_dash_offset,global_alpha:self.global_alpha,composite_copy:self.composite_copy,font:self.font.clone(),text_align:self.text_align.clone(),text_baseline:self.text_baseline.clone(),line_dash:self.line_dash.clone(),state_stack:Vec::new(),clip:self.clip.clone() }
    }
}

unsafe extern "C" fn gradient_add_stop(env:NapiEnv, info:NapiCallbackInfo)->NapiValue {
    let (args,this_arg,_)=callback_info(env,info);
    if args.len()<2{return type_error(env,"addColorStop requires two arguments");}
    let mut tagged=false; (api().check_object_type_tag)(env,this_arg,&GRADIENT_TYPE_TAG,&mut tagged);
    if !tagged{return type_error(env,"Illegal invocation");}
    let mut raw=ptr::null_mut();if (api().unwrap)(env,this_arg,&mut raw)!=0 || raw.is_null(){return undefined(env);}
    let mut converted=ptr::null_mut();if (api().coerce_to_number)(env,args[0],&mut converted)!=0{return undefined(env);}
    let off=number(env,converted);
    if !off.is_finite(){return type_error(env,"Offset must be finite");}
    if !(0.0..=1.0).contains(&off){return dom_error(env,"IndexSizeError","Offset must be between zero and one");}
    let Some(col)=value_string(env,args[1]).and_then(|s|parse_color(&s)) else{return dom_error(env,"SyntaxError","Invalid color");};
    let mut g=(*(raw as *mut GradientObject)).0.borrow_mut();g.stops.push((off,col));g.stops.sort_by(|a,b|a.0.total_cmp(&b.0));
    undefined(env)
}
unsafe fn create_gradient(env:NapiEnv, g:Gradient)->NapiValue { let mut o=ptr::null_mut(); (api().create_object)(env,&mut o); (api().type_tag_object)(env,o,&GRADIENT_TYPE_TAG); (api().wrap)(env,o,Box::into_raw(Box::new(GradientObject(Rc::new(RefCell::new(g))))) as *mut c_void,Some(finalize_gradient),ptr::null_mut(),ptr::null_mut()); let mut f=ptr::null_mut(); (api().create_function)(env,b"addColorStop\0".as_ptr() as *const c_char,12,gradient_add_stop,ptr::null_mut(),&mut f); set(env,o,"addColorStop",f); o }
unsafe fn create_pattern(env:NapiEnv, pattern:Pattern)->NapiValue { let mut o=ptr::null_mut(); (api().create_object)(env,&mut o); (api().type_tag_object)(env,o,&PATTERN_TYPE_TAG); (api().wrap)(env,o,Box::into_raw(Box::new(PatternObject(pattern))) as *mut c_void,Some(finalize_pattern),ptr::null_mut(),ptr::null_mut()); o }

unsafe fn reset_canvas_state(canvas: &mut Canvas2D) {
 canvas.fill=Style::Color([0,0,0,255]); canvas.stroke=Style::Color([0,0,0,255]); canvas.shadow=[0,0,0,0]; canvas.shadow_blur=0.0; canvas.shadow_offset_x=0.0; canvas.shadow_offset_y=0.0; canvas.transform=[1.0,0.0,0.0,1.0,0.0,0.0]; canvas.path.clear(); canvas.current_path=None; canvas.line_width=1.0; canvas.line_cap="butt".to_string(); canvas.line_join="miter".to_string(); canvas.miter_limit=10.0; canvas.line_dash.clear(); canvas.line_dash_offset=0.0; canvas.global_alpha=1.0; canvas.composite_copy=false; canvas.font="10px sans-serif".to_string(); canvas.text_align="start".to_string(); canvas.text_baseline="alphabetic".to_string(); canvas.state_stack.clear(); canvas.clip.clear(); if !canvas.native.is_null(){skia_canvas_reset(canvas.native);}  canvas.pixels.fill(0);
}

unsafe extern "C" fn canvas_2d_method(env: NapiEnv, info: NapiCallbackInfo) -> NapiValue {
    let (args, this_arg, index) = callback_info(env, info);
    let name = CANVAS_2D_METHODS.get(index).copied().unwrap_or("");
    let Some(canvas) = canvas_2d_from(env, this_arg) else { return undefined(env); };
    match name {
        "fillRect" | "clearRect" => {
            if args.len() >= 4 {
                let x=number(env,args[0]); let y=number(env,args[1]); let w=number(env,args[2]); let h=number(env,args[3]);
                if !canvas.native.is_null() {
                    if name == "clearRect" { skia_canvas_clear_rect(canvas.native, x as f32, y as f32, w as f32, h as f32); }
                    else { sync_native_paint(canvas); skia_canvas_fill_rect(canvas.native, x as f32, y as f32, w as f32, h as f32); }
                }
            }
            undefined(env)
        }
        "drawImage" => {
            if args.len() < 3 || canvas.native.is_null() { return undefined(env); }
            let mut data = ptr::null_mut(); let mut width_value = ptr::null_mut(); let mut height_value = ptr::null_mut();
            let data_name = CString::new("data").unwrap(); let width_name = CString::new("width").unwrap(); let height_name = CString::new("height").unwrap();
            if (api().get_named_property)(env, args[0], data_name.as_ptr(), &mut data) != 0 ||
               (api().get_named_property)(env, args[0], width_name.as_ptr(), &mut width_value) != 0 ||
               (api().get_named_property)(env, args[0], height_name.as_ptr(), &mut height_value) != 0 { return undefined(env); }
            let mut width = 0u32; let mut height = 0u32;
            (api().get_value_uint32)(env, width_value, &mut width); (api().get_value_uint32)(env, height_value, &mut height);
            let mut kind = 0i32; let mut length = 0usize; let mut source = ptr::null_mut(); let mut buffer = ptr::null_mut(); let mut offset = 0usize;
            if width == 0 || height == 0 || (api().get_typedarray_info)(env, data, &mut kind, &mut length, &mut source, &mut buffer, &mut offset) != 0 || source.is_null() || length < width as usize * height as usize * 4 { return undefined(env); }
            let (sx, sy, sw, sh, dx, dy, dw, dh) = if args.len() >= 9 {
                (number(env,args[1]), number(env,args[2]), number(env,args[3]), number(env,args[4]), number(env,args[5]), number(env,args[6]), number(env,args[7]), number(env,args[8]))
            } else if args.len() >= 5 {
                (0.0, 0.0, width as f64, height as f64, number(env,args[1]), number(env,args[2]), number(env,args[3]), number(env,args[4]))
            } else {
                (0.0, 0.0, width as f64, height as f64, number(env,args[1]), number(env,args[2]), width as f64, height as f64)
            };
            sync_native_paint(canvas);
            skia_canvas_draw_rgba_image(canvas.native, source as *const u8, width, height, sx as f32, sy as f32, sw as f32, sh as f32, dx as f32, dy as f32, dw as f32, dh as f32);
            undefined(env)
        }
        "createPattern" => {
            if args.len() < 1 { return undefined(env); }
            let mut data=ptr::null_mut(); let mut wv=ptr::null_mut(); let mut hv=ptr::null_mut();
            let dn=CString::new("data").unwrap(); let wn=CString::new("width").unwrap(); let hn=CString::new("height").unwrap();
            if (api().get_named_property)(env,args[0],dn.as_ptr(),&mut data)!=0 || (api().get_named_property)(env,args[0],wn.as_ptr(),&mut wv)!=0 || (api().get_named_property)(env,args[0],hn.as_ptr(),&mut hv)!=0 { return undefined(env); }
            let mut width=0u32; let mut height=0u32; (api().get_value_uint32)(env,wv,&mut width); (api().get_value_uint32)(env,hv,&mut height);
            let mut kind=0i32; let mut length=0usize; let mut source=ptr::null_mut(); let mut buffer=ptr::null_mut(); let mut offset=0usize;
            if width==0 || height==0 || (api().get_typedarray_info)(env,data,&mut kind,&mut length,&mut source,&mut buffer,&mut offset)!=0 || source.is_null() || length < width as usize*height as usize*4 { return undefined(env); }
            let repetition=args.get(1).and_then(|v|value_string(env,*v)).unwrap_or_else(||"repeat".to_string());
            let (repeat_x,repeat_y)=match repetition.as_str() { "repeat-x"=>(true,false), "repeat-y"=>(false,true), "no-repeat"=>(false,false), _=>(true,true) };
            create_pattern(env,Pattern{pixels:std::slice::from_raw_parts(source as *const u8,width as usize*height as usize*4).to_vec(),width,height,repeat_x,repeat_y})
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
                let x1=number(env,args[0]); let y1=number(env,args[1]); let x2=number(env,args[2]); let y2=number(env,args[3]); let radius=number(env,args[4]).max(0.0);
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
        "arc" => { if args.len()>=5 { let x=number(env,args[0]); let y=number(env,args[1]); let r=number(env,args[2]); let sa=number(env,args[3]); let ea=number(env,args[4]); if r<0.0{return dom_error(env,"IndexSizeError","Negative arc radius");}if ![x,y,r,sa,ea].iter().all(|v|v.is_finite()){return undefined(env);}if !canvas.native.is_null(){skia_canvas_arc(canvas.native,x as f32,y as f32,r as f32,sa as f32,ea as f32,truthy(env,args.get(5)) as i32);} let i=canvas.path.len(); let mut p=Path{points:Vec::new(),closed:false}; for k in 0..=64 { let t=sa+(ea-sa)*k as f64/64.0; p.points.push(tx(canvas.transform,x+r*t.cos(),y+r*t.sin())); } canvas.path.push(p); canvas.current_path=Some(i); } undefined(env) }
        "moveTo" | "lineTo" => { if args.len()>=2 { let raw_x=number(env,args[0]);let raw_y=number(env,args[1]); let (x,y)=tx(canvas.transform,raw_x,raw_y); if name=="moveTo" || canvas.current_path.is_none() { canvas.path.push(Path{points:vec![(x,y)],closed:false}); canvas.current_path=Some(canvas.path.len()-1); } else if let Some(i)=canvas.current_path { canvas.path[i].points.push((x,y)); } if !canvas.native.is_null(){if name=="moveTo"{skia_canvas_move_to(canvas.native,raw_x as f32,raw_y as f32)}else{skia_canvas_line_to(canvas.native,raw_x as f32,raw_y as f32)}} } undefined(env) }
        "quadraticCurveTo" => { if args.len()>=4 { let (x1,y1,x2,y2)=(number(env,args[0]),number(env,args[1]),number(env,args[2]),number(env,args[3])); if !canvas.native.is_null(){skia_canvas_quad_to(canvas.native,x1 as f32,y1 as f32,x2 as f32,y2 as f32);} if let Some(i)=canvas.current_path { let p=*canvas.path[i].points.last().unwrap(); let q=tx(canvas.transform,x1,y1); let e=tx(canvas.transform,x2,y2); for n in 1..=32 { let t=n as f64/32.0; let m=1.0-t; canvas.path[i].points.push((m*m*p.0+2.0*m*t*q.0+t*t*e.0,m*m*p.1+2.0*m*t*q.1+t*t*e.1)); } } } undefined(env) }
        "bezierCurveTo" => { if args.len()>=6 { let (x1,y1,x2,y2,x3,y3)=(number(env,args[0]),number(env,args[1]),number(env,args[2]),number(env,args[3]),number(env,args[4]),number(env,args[5])); if !canvas.native.is_null(){skia_canvas_cubic_to(canvas.native,x1 as f32,y1 as f32,x2 as f32,y2 as f32,x3 as f32,y3 as f32);} if let Some(i)=canvas.current_path { let p=*canvas.path[i].points.last().unwrap(); let q=tx(canvas.transform,x1,y1); let r=tx(canvas.transform,x2,y2); let e=tx(canvas.transform,x3,y3); for n in 1..=48 { let t=n as f64/48.0; let m=1.0-t; canvas.path[i].points.push((m*m*m*p.0+3.0*m*m*t*q.0+3.0*m*t*t*r.0+t*t*t*e.0,m*m*m*p.1+3.0*m*m*t*q.1+3.0*m*t*t*r.1+t*t*t*e.1)); } } } undefined(env) }
        "ellipse" => { if args.len()>=7 { let (x,y,rx,ry,rot,sa,ea)=(number(env,args[0]),number(env,args[1]),number(env,args[2]),number(env,args[3]),number(env,args[4]),number(env,args[5]),number(env,args[6])); if rx<0.0 || ry<0.0{return dom_error(env,"IndexSizeError","Negative ellipse radius");}if ![x,y,rx,ry,rot,sa,ea].iter().all(|v|v.is_finite()){return undefined(env);}if !canvas.native.is_null(){skia_canvas_ellipse(canvas.native,x as f32,y as f32,rx as f32,ry as f32,rot as f32,sa as f32,ea as f32,truthy(env,args.get(7)) as i32);} let i=canvas.path.len(); let mut p=Path{points:Vec::new(),closed:true}; let n:usize=96; for k in 0..=n { let t: f64=sa+(ea-sa)*k as f64/n as f64; let (sx,sy)=(rx*t.cos(),ry*t.sin()); p.points.push(tx(canvas.transform,x+sx*rot.cos()-sy*rot.sin(),y+sx*rot.sin()+sy*rot.cos())); } canvas.path.push(p); canvas.current_path=Some(i); } undefined(env) }
        "fill" | "stroke" => { sync_native_paint(canvas); if !canvas.native.is_null(){if name=="fill"{let evenodd=args.first().and_then(|value|value_string(env,*value)).as_deref()==Some("evenodd");skia_canvas_fill(canvas.native,evenodd as i32)}else{skia_canvas_stroke(canvas.native)}} undefined(env) }
        "strokeRect" => { if args.len()>=4 { let x=number(env,args[0]);let y=number(env,args[1]);let w=number(env,args[2]);let h=number(env,args[3]); sync_native_paint(canvas); if !canvas.native.is_null(){skia_canvas_stroke_rect(canvas.native,x as f32,y as f32,w as f32,h as f32);} } undefined(env) }
        "scale" => { if args.len()>=1 { let sx=number(env,args[0]); let sy=if args.len()>1{number(env,args[1])}else{sx}; canvas.transform[0]*=sx; canvas.transform[1]*=sx; canvas.transform[2]*=sy; canvas.transform[3]*=sy; if !canvas.native.is_null(){skia_canvas_scale(canvas.native,sx as f32,sy as f32);} } undefined(env) }
        "translate" => { if args.len()>=2 { let x=number(env,args[0]);let y=number(env,args[1]); canvas.transform[4]+=canvas.transform[0]*x+canvas.transform[2]*y; canvas.transform[5]+=canvas.transform[1]*x+canvas.transform[3]*y; if !canvas.native.is_null(){skia_canvas_translate(canvas.native,x as f32,y as f32);} } undefined(env) }
        "rotate" => { if let Some(a)=args.first(){let a=number(env,*a);let (s,co)=a.sin_cos();let t=canvas.transform; canvas.transform=[t[0]*co+t[2]*s,t[1]*co+t[3]*s,t[2]*co-t[0]*s,t[3]*co-t[1]*s,t[4],t[5]];if !canvas.native.is_null(){skia_canvas_rotate(canvas.native,a as f32);}} undefined(env) }
        "transform" => { if args.len()>=6 { let (a,b,c,d,e,f)=(number(env,args[0]),number(env,args[1]),number(env,args[2]),number(env,args[3]),number(env,args[4]),number(env,args[5])); let t=canvas.transform; canvas.transform=[t[0]*a+t[2]*b,t[1]*a+t[3]*b,t[0]*c+t[2]*d,t[1]*c+t[3]*d,t[0]*e+t[2]*f+t[4],t[1]*e+t[3]*f+t[5]];if !canvas.native.is_null(){skia_canvas_transform(canvas.native,a as f32,b as f32,c as f32,d as f32,e as f32,f as f32);}} undefined(env) }
        "resetTransform" => { canvas.transform=[1.0,0.0,0.0,1.0,0.0,0.0];if !canvas.native.is_null(){skia_canvas_set_transform(canvas.native,1.0,0.0,0.0,1.0,0.0,0.0);} undefined(env) }
        "setTransform" => { if args.len()>=6 { let (a,b,c,d,e,f)=(number(env,args[0]),number(env,args[1]),number(env,args[2]),number(env,args[3]),number(env,args[4]),number(env,args[5]));canvas.transform=[a,b,c,d,e,f];if !canvas.native.is_null(){skia_canvas_set_transform(canvas.native,a as f32,b as f32,c as f32,d as f32,e as f32,f as f32);}} undefined(env) }
        "setLineDash" => {
            canvas.line_dash.clear();
            if let Some(array) = args.first() {
                let mut length = 0u32;
                if (api().get_array_length)(env, *array, &mut length) == 0 {
                    for index in 0..length { let mut item = ptr::null_mut(); if (api().get_element)(env, *array, index, &mut item) == 0 { let value = number(env, item); if value.is_finite() && value >= 0.0 { canvas.line_dash.push(value); } } }
                }
            }
            if canvas.line_dash.len() % 2 == 1 { let copy = canvas.line_dash.clone(); canvas.line_dash.extend(copy); }
            undefined(env)
        }
        "save" => { canvas.state_stack.push(CanvasState{fill:canvas.fill.clone(),stroke:canvas.stroke.clone(),shadow:canvas.shadow,shadow_blur:canvas.shadow_blur,shadow_offset_x:canvas.shadow_offset_x,shadow_offset_y:canvas.shadow_offset_y,transform:canvas.transform,line_width:canvas.line_width,line_cap:canvas.line_cap.clone(),line_join:canvas.line_join.clone(),miter_limit:canvas.miter_limit,line_dash_offset:canvas.line_dash_offset,global_alpha:canvas.global_alpha,composite_copy:canvas.composite_copy,font:canvas.font.clone(),text_align:canvas.text_align.clone(),text_baseline:canvas.text_baseline.clone(),line_dash:canvas.line_dash.clone(),clip:canvas.clip.clone()}); if !canvas.native.is_null(){skia_canvas_save(canvas.native);} undefined(env) }
        "restore" => { if let Some(s)=canvas.state_stack.pop(){canvas.fill=s.fill;canvas.stroke=s.stroke;canvas.shadow=s.shadow;canvas.shadow_blur=s.shadow_blur;canvas.shadow_offset_x=s.shadow_offset_x;canvas.shadow_offset_y=s.shadow_offset_y;canvas.transform=s.transform;canvas.line_width=s.line_width;canvas.line_cap=s.line_cap;canvas.line_join=s.line_join;canvas.miter_limit=s.miter_limit;canvas.line_dash_offset=s.line_dash_offset;canvas.global_alpha=s.global_alpha;canvas.composite_copy=s.composite_copy;canvas.font=s.font;canvas.text_align=s.text_align;canvas.text_baseline=s.text_baseline;canvas.line_dash=s.line_dash;canvas.clip=s.clip;} if !canvas.native.is_null(){skia_canvas_restore(canvas.native);} undefined(env) }
        "fillText" | "strokeText" => { if args.len()>=3 { let text=value_string(env,args[0]).unwrap_or_default(); let font=font_spec(&canvas.font); let mut x=number(env,args[1]); let y=number(env,args[2]) + text_baseline_offset(canvas, &font); let width=if canvas.native.is_null(){text.chars().count() as f64*font.size*0.6}else{skia_canvas_measure_text(canvas.native,text.as_ptr(),text.len() as u32,font.family.as_ptr(),font.size as f32,font.weight,font.slant) as f64}; if canvas.text_align=="center" {x-=width/2.0;} else if canvas.text_align=="right" || canvas.text_align=="end" {x-=width;} sync_native_paint(canvas); if !canvas.native.is_null(){skia_canvas_draw_text(canvas.native,text.as_ptr(),text.len() as u32,font.family.as_ptr(),x as f32,y as f32,font.size as f32,(name=="strokeText") as i32,font.weight,font.slant);} } undefined(env) }
        "getTransform" => { let mut o=ptr::null_mut(); (api().create_object)(env,&mut o); for (n,v) in [("a",canvas.transform[0]),("b",canvas.transform[1]),("c",canvas.transform[2]),("d",canvas.transform[3]),("e",canvas.transform[4]),("f",canvas.transform[5])] { set(env,o,n,number_value(env,v)); } o }
        "measureText" => {
            let mut o=ptr::null_mut(); (api().create_object)(env,&mut o);
            let text=args.first().and_then(|v|value_string(env,*v)).unwrap_or_default();
            let font=font_spec(&canvas.font);
            let width=if canvas.native.is_null(){text.chars().count() as f64*font.size*0.6}else{skia_canvas_measure_text(canvas.native,text.as_ptr(),text.len() as u32,font.family.as_ptr(),font.size as f32,font.weight,font.slant) as f64};
            set(env,o,"width",number_value(env,width));
            let (mut ascent,mut descent)=(font.size*0.8,font.size*0.2);
            if !canvas.native.is_null() { let mut a=0.0f32; let mut d=0.0f32; skia_canvas_font_metrics(canvas.native,font.family.as_ptr(),font.size as f32,font.weight,font.slant,&mut a,&mut d); ascent=(-a) as f64; descent=d as f64; }
            for (name,value) in [("actualBoundingBoxAscent",ascent),("actualBoundingBoxDescent",descent),("fontBoundingBoxAscent",ascent),("fontBoundingBoxDescent",descent),("emHeightAscent",ascent),("emHeightDescent",descent),("hangingBaseline",0.0),("alphabeticBaseline",0.0),("ideographicBaseline",descent),("actualBoundingBoxLeft",0.0),("actualBoundingBoxRight",width)] { set(env,o,name,number_value(env,value)); }
            o
        }
        "getImageData" => {
            if args.len() < 4 { return type_error(env,"getImageData requires four arguments"); }
            let Some(mut x)=webidl_long(env,args[0]) else{return undefined(env);};
            let Some(mut y)=webidl_long(env,args[1]) else{return undefined(env);};
            let Some(mut width)=webidl_long(env,args[2]) else{return undefined(env);};
            let Some(mut height)=webidl_long(env,args[3]) else{return undefined(env);};
            if width==0 || height==0 {return dom_error(env,"IndexSizeError","Image dimensions must be nonzero");}
            if width<0{x+=width;width=-width;}if height<0{y+=height;height=-height;}
            let (x,y)=(x as isize,y as isize);let (width,height)=(width as usize,height as usize);
            let Some(length)=width.checked_mul(height).and_then(|n|n.checked_mul(4)) else{return dom_error(env,"RangeError","Image allocation is too large");};
            let mut pixels=Vec::new();
            if pixels.try_reserve_exact(length).is_err(){return dom_error(env,"RangeError","Image allocation failed");}
            pixels.resize(length,0);
            if !canvas.native.is_null() {
                skia_canvas_read(canvas.native, x.clamp(i32::MIN as isize, i32::MAX as isize) as i32,
                                 y.clamp(i32::MIN as isize, i32::MAX as isize) as i32,
                                 width.min(u32::MAX as usize) as u32, height.min(u32::MAX as usize) as u32,
                                 pixels.as_mut_ptr());
                return image_data(env, width, height, &pixels);
            }
            for row in 0..height {
                for column in 0..width {
                    let source_x = x + column as isize; let source_y = y + row as isize;
                    if source_x >= 0 && source_y >= 0 && source_x < canvas.width as isize && source_y < canvas.height as isize {
                        let source = (source_y as usize * canvas.width + source_x as usize) * 4;
                        let destination = (row * width + column) * 4;
                        pixels[destination..destination + 4].copy_from_slice(&canvas.pixels[source..source + 4]);
                    }
                }
            }
            image_data(env, width, height, &pixels)
        }
        "createImageData" => {
            let (width,height) = if args.len() >= 2 {
                (floor(number(env, args[0])).max(0) as usize, floor(number(env, args[1])).max(0) as usize)
            } else if let Some(source) = args.first() {
                let mut width_value=ptr::null_mut(); let mut height_value=ptr::null_mut();
                let wn=CString::new("width").unwrap(); let hn=CString::new("height").unwrap();
                if (api().get_named_property)(env,*source,wn.as_ptr(),&mut width_value)==0 && (api().get_named_property)(env,*source,hn.as_ptr(),&mut height_value)==0 {
                    (floor(number(env,width_value)).max(0) as usize, floor(number(env,height_value)).max(0) as usize)
                } else { return image_data(env,0,0,&[]); }
            } else { return image_data(env, 0, 0, &[]); };
            let pixels = vec![0; width.saturating_mul(height).saturating_mul(4)];
            image_data(env, width, height, &pixels)
        }
        "putImageData" => {
            if args.len() < 3 { return undefined(env); }
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
            let mut dest_x = floor(number(env, args[1])); let mut dest_y = floor(number(env, args[2]));
            let source = std::slice::from_raw_parts(source as *const u8, length);
            if length < width as usize * height as usize * 4 { return undefined(env); }
            let mut write_x = 0usize; let mut write_y = 0usize;
            let mut write_width = width as usize; let mut write_height = height as usize;
            if args.len() >= 7 {
                let dirty_x = floor(number(env, args[3])); let dirty_y = floor(number(env, args[4]));
                let dirty_width = floor(number(env, args[5])); let dirty_height = floor(number(env, args[6]));
                if dirty_width <= 0 || dirty_height <= 0 { return undefined(env); }
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
                                      dest_y.clamp(i32::MIN as isize, i32::MAX as isize) as i32);
                } else {
                    let mut cropped = vec![0u8; write_width * write_height * 4];
                    for row in 0..write_height {
                        let from = ((write_y + row) * width as usize + write_x) * 4;
                        let to = row * write_width * 4;
                        cropped[to..to + write_width * 4].copy_from_slice(&source[from..from + write_width * 4]);
                    }
                    skia_canvas_write(canvas.native, cropped.as_ptr(), write_width as u32, write_height as u32,
                                  dest_x.clamp(i32::MIN as isize, i32::MAX as isize) as i32,
                                  dest_y.clamp(i32::MIN as isize, i32::MAX as isize) as i32);
                }
                return undefined(env);
            }
            for row in 0..write_height {
                for column in 0..write_width {
                    let x = dest_x + column as isize; let y = dest_y + row as isize;
                    let from = ((write_y + row) * width as usize + write_x + column) * 4;
                    if x >= 0 && y >= 0 && x < canvas.width as isize && y < canvas.height as isize && from + 4 <= source.len() {
                        let to = (y as usize * canvas.width + x as usize) * 4;
                        canvas.pixels[to..to + 4].copy_from_slice(&source[from..from + 4]);
                    }
                }
            }
            undefined(env)
        }
        "reset" => { reset_canvas_state(canvas); undefined(env) }
        "_resize" => {
            if args.len()<2{return type_error(env,"resize requires dimensions");}
            let width=number(env,args[0]) as usize;let height=number(env,args[1]) as usize;
            let next=skia_canvas_create(width as u32,height as u32);
            if width>0 && height>0 && next.is_null(){return dom_error(env,"InvalidStateError","Canvas allocation failed");}
            if !canvas.native.is_null(){skia_canvas_destroy(canvas.native);}
            canvas.native=next;canvas.width=width;canvas.height=height;
            canvas.pixels=vec![0;width.saturating_mul(height).saturating_mul(4)];
            reset_canvas_state(canvas);undefined(env)
        }
        "_clearBitmap" => {canvas.pixels.fill(0);if !canvas.native.is_null(){skia_canvas_clear_bitmap(canvas.native);}undefined(env)}
        "isContextLost" => boolean(env, false),
        "isPointInPath" | "isPointInStroke" => {
            if args.len() < 2 || canvas.native.is_null() { return boolean(env, false); }
            if name == "isPointInStroke" { sync_native_paint(canvas); }
            let evenodd = name == "isPointInPath" && args.get(2).and_then(|value|value_string(env,*value)).as_deref() == Some("evenodd");
            boolean(env, skia_canvas_point_in_path(canvas.native, number(env,args[0]) as f32,
                number(env,args[1]) as f32, (name == "isPointInStroke") as i32, evenodd as i32) != 0)
        },
        "getLineDash" => { let mut result = ptr::null_mut(); (api().create_array_with_length)(env, canvas.line_dash.len(), &mut result); for (index, value) in canvas.line_dash.iter().enumerate() { (api().set_element)(env, result, index as u32, number_value(env, *value)); } result }
        "clip" => { let evenodd=args.first().and_then(|value|value_string(env,*value)).as_deref()==Some("evenodd"); let paths=canvas.path.clone(); if !paths.is_empty() { canvas.clip.push(paths); if !canvas.native.is_null(){skia_canvas_clip(canvas.native,evenodd as i32);} } undefined(env) }
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
        "readPixels" => { if let Some(c)=context { if args.len()>=7 { let mut w=0u32;let mut h=0u32;(api().get_value_uint32)(env,args[2],&mut w);(api().get_value_uint32)(env,args[3],&mut h); let mut kind=0;let mut len=0;let mut ptrv=ptr::null_mut();let mut buf=ptr::null_mut();let mut off=0;(api().get_typedarray_info)(env,args[6],&mut kind,&mut len,&mut ptrv,&mut buf,&mut off);if !ptrv.is_null(){let out=std::slice::from_raw_parts_mut(ptrv as *mut u8,len);for y in 0..h as usize{for x in 0..w as usize{let si=((y.min(149)*300+x.min(299))*4);let di=(y*w as usize+x)*4;if di+4<=out.len(){out[di..di+4].copy_from_slice(&c.color[si..si+4]);}}}} } } undefined(env) }
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

unsafe fn canvas(width: usize, height: usize, env: NapiEnv) -> NapiValue {
    let mut object = ptr::null_mut();
    (api().create_object)(env, &mut object);
    set(env, object, "width", uint32(env, width as u32));
    set(env, object, "height", uint32(env, height as u32));
    for (index, name) in ["getContext", "convertToBlob", "transferToImageBitmap"].iter().enumerate() {
        let mut function = ptr::null_mut();
        let name_c = CString::new(*name).unwrap();
        (api().create_function)(env, name_c.as_ptr(), name.len(), canvas_method, index as *mut c_void, &mut function);
        set(env, object, name, function);
    }
    object
}

unsafe extern "C" fn canvas_method(env: NapiEnv, info: NapiCallbackInfo) -> NapiValue {
    let (args, this_arg, index) = callback_info(env, info);
    if index != 0 { return undefined(env); }
    let mut width_value = ptr::null_mut(); let mut height_value = ptr::null_mut();
    let width_name = CString::new("width").unwrap(); let height_name = CString::new("height").unwrap();
    (api().get_named_property)(env, this_arg, width_name.as_ptr(), &mut width_value);
    (api().get_named_property)(env, this_arg, height_name.as_ptr(), &mut height_value);
    let mut width = 300u32; let mut height = 150u32;
    (api().get_value_uint32)(env, width_value, &mut width);
    (api().get_value_uint32)(env, height_value, &mut height);
    match args.first().and_then(|value| value_string(env, *value)).as_deref() {
        Some("2d") => canvas_2d(width as usize, height as usize, env),
        Some("webgl") | Some("experimental-webgl") => create_context(env, 1),
        Some("webgl2") => create_context(env, 2),
        _ => ptr::null_mut(),
    }
}

unsafe extern "C" fn offscreen_canvas_constructor(env: NapiEnv, info: NapiCallbackInfo) -> NapiValue {
    let (args, _, _) = callback_info(env, info);
    let width = args.first().map(|value| number(env, *value).max(0.0) as usize).unwrap_or(300);
    let height = args.get(1).map(|value| number(env, *value).max(0.0) as usize).unwrap_or(150);
    canvas(width, height, env)
}

unsafe extern "C" fn canvas_2d_constructor(env: NapiEnv, _: NapiCallbackInfo) -> NapiValue {
    canvas_2d(300, 150, env)
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
    set(env, exports, "WebGLRenderingContext", webgl1);
    set(env, exports, "WebGL2RenderingContext", webgl2);
    install_object_constructors(env, exports);
    install_canvas_constructors(env, exports);
    let mut constants = ptr::null_mut();
    (api().create_object)(env, &mut constants);
    for &(name, value) in CONSTANTS { set(env, constants, name, uint32(env, value)); }
    set(env, exports, "constants", constants);
    exports
}
