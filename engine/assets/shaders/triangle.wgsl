// ============================================================================
// PROMETHEUS Engine — Triangle Shader (Validation)
// ============================================================================
// Purpose: Minimal triangle shader for Gate Φ-0 validation.
//          Renders a single fullscreen triangle with vertex colors.
// Binding: Group 0 — Frame Uniforms (not used in this minimal shader)
// ============================================================================

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0)       color:    vec3<f32>,
};

// Fullscreen triangle via vertex_index trick (no vertex buffer needed).
// Vertices: (-1,-1), (3,-1), (-1,3) — covers the entire clip space.
@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    var out: VertexOutput;

    // Generate fullscreen triangle positions from vertex index
    let x = f32(i32(vertex_index & 1u) * 4 - 1);
    let y = f32(i32(vertex_index >> 1u) * 4 - 1);
    out.position = vec4<f32>(x, y, 0.0, 1.0);

    // Assign vertex colors: Red, Green, Blue
    let colors = array<vec3<f32>, 3>(
        vec3<f32>(1.0, 0.0, 0.0),  // Red
        vec3<f32>(0.0, 1.0, 0.0),  // Green
        vec3<f32>(0.0, 0.0, 1.0),  // Blue
    );
    out.color = colors[vertex_index % 3u];

    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    return vec4<f32>(in.color, 1.0);
}
