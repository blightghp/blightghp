// ============================================================================
// PROMETHEUS Engine — Tonemapping Shader (AgX)
// ============================================================================
// Purpose: Fullscreen post-processing pass converting HDR Rgba16Float
//          to LDR Bgra8UnormSrgb via AgX tone mapping curve.
// Binding: Group 1 — Pass Uniforms (HDR texture + sampler)
// Reference: AgX by Troy Sobotka — https://github.com/sobotka/AgX
// ============================================================================

// --- Frame Uniforms (Group 0) ---
struct FrameUniforms {
    view_projection: mat4x4<f32>,
    camera_position: vec4<f32>,
    time_seconds:    f32,
    delta_seconds:   f32,
    resolution:      vec2<f32>,
    exposure:        f32,
    _pad0:           f32,
    _pad1:           f32,
    _pad2:           f32,
};

@group(0) @binding(0)
var<uniform> frame: FrameUniforms;

// --- Pass Uniforms (Group 1) ---
@group(1) @binding(0)
var hdr_texture: texture_2d<f32>;

@group(1) @binding(1)
var hdr_sampler: sampler;

// --- Vertex Output ---
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0)       uv:      vec2<f32>,
};

// Fullscreen triangle (vertex-index trick, no vertex buffer)
@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    var out: VertexOutput;

    let x = f32(i32(vertex_index & 1u) * 4 - 1);
    let y = f32(i32(vertex_index >> 1u) * 4 - 1);
    out.position = vec4<f32>(x, y, 0.0, 1.0);

    // UV: map clip [-1,1] to texture [0,1], flip Y
    out.uv = vec2<f32>(
        (x + 1.0) * 0.5,
        (1.0 - y) * 0.5,
    );

    return out;
}

// --- AgX Tone Mapping ---
// Attempt to match the AgX "Base Contrast" look.

// AgX log2 encoding: maps [0, 1] to a perceptually uniform space
fn agx_default_contrast_approx(x: vec3<f32>) -> vec3<f32> {
    // 6th order polynomial fit of the AgX sigmoid
    let x2 = x * x;
    let x4 = x2 * x2;

    return 15.5     * x4 * x2
         - 40.14    * x4 * x
         + 31.96    * x4
         - 6.868    * x2 * x
         + 0.4298   * x2
         + 0.1191   * x
         - 0.00232;
}

fn agx(val: vec3<f32>) -> vec3<f32> {
    // AgX input transform (sRGB to AgX log space)
    let agx_mat = mat3x3<f32>(
        vec3<f32>(0.842479062253094,  0.0423282422610123, 0.0423756549057051),
        vec3<f32>(0.0784335999999992, 0.878468636469772,  0.0784336),
        vec3<f32>(0.0792237451477643, 0.0791661274605434, 0.879142973793104),
    );

    let min_ev = -12.47393;
    let max_ev = 4.026069;

    var v = agx_mat * val;

    // Clamp to valid range and apply log2 encoding
    v = clamp(log2(v), vec3<f32>(min_ev), vec3<f32>(max_ev));

    // Normalize to [0, 1]
    v = (v - vec3<f32>(min_ev)) / (max_ev - min_ev);

    // Apply sigmoid contrast curve
    v = agx_default_contrast_approx(v);

    return v;
}

fn agx_eotf(val: vec3<f32>) -> vec3<f32> {
    // AgX output transform (AgX log space back to sRGB)
    let agx_mat_inv = mat3x3<f32>(
        vec3<f32>(1.19687900512017,   -0.0528968517574562, -0.0529716355144438),
        vec3<f32>(-0.0980208811401368, 1.15190312990417,   -0.0980434501171241),
        vec3<f32>(-0.0990297440797205, -0.0989611768448433, 1.15107367264116),
    );

    return agx_mat_inv * val;
}

fn linear_to_srgb(linear: vec3<f32>) -> vec3<f32> {
    let cutoff = step(vec3<f32>(0.0031308), linear);
    let low  = linear * 12.92;
    let high = 1.055 * pow(linear, vec3<f32>(1.0 / 2.4)) - vec3<f32>(0.055);
    return mix(low, high, cutoff);
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    var hdr_color = textureSample(hdr_texture, hdr_sampler, in.uv).rgb;

    // Apply exposure
    hdr_color = hdr_color * frame.exposure;

    // Apply AgX tone mapping
    var mapped = agx(max(hdr_color, vec3<f32>(0.0)));
    mapped = agx_eotf(mapped);

    // Convert linear to sRGB
    let srgb = linear_to_srgb(clamp(mapped, vec3<f32>(0.0), vec3<f32>(1.0)));

    return vec4<f32>(srgb, 1.0);
}
