struct GridUniforms {
    viewProj : mat4x4<f32>,
    invViewProj : mat4x4<f32>,
    cameraPos : vec4<f32>,
};

@group(0) @binding(0) var<uniform> u : GridUniforms;

struct VertexOutput {
    @builtin(position) position : vec4<f32>,
    @location(0) nearPoint : vec3<f32>,
    @location(1) farPoint : vec3<f32>,
};

fn unprojectPoint(x: f32, y: f32, z: f32, invViewProj: mat4x4<f32>) -> vec3<f32> {
    let unprojectedPoint = invViewProj * vec4<f32>(x, y, z, 1.0);
    return unprojectedPoint.xyz / unprojectedPoint.w;
}

@vertex
fn vs_main(@builtin(vertex_index) VertexIndex : u32) -> VertexOutput {
    var pos = array<vec2<f32>, 6>(
        vec2<f32>(-1.0, -1.0), vec2<f32>( 1.0, -1.0), vec2<f32>(-1.0,  1.0),
        vec2<f32>( 1.0, -1.0), vec2<f32>( 1.0,  1.0), vec2<f32>(-1.0,  1.0)
    );

    let p = pos[VertexIndex];
    var out: VertexOutput;
    // Set z to 1.0 so it is far back in NDC space, though the fragment shader writes the true depth.
    out.position = vec4<f32>(p, 1.0, 1.0); 

    // Unproject to find the ray endpoints on the near and far planes
    out.nearPoint = unprojectPoint(p.x, p.y, 0.0, u.invViewProj);
    out.farPoint  = unprojectPoint(p.x, p.y, 1.0, u.invViewProj);
    return out;
}

struct FragmentOutput {
    @location(0) color : vec4<f32>,
    @builtin(frag_depth) depth : f32,
};

@fragment
fn fs_main(in : VertexOutput) -> FragmentOutput {
    let t = -in.nearPoint.y / (in.farPoint.y - in.nearPoint.y);
    if (t < 0.0) {
        discard; // Above horizon
    }

    let fragPos3D = in.nearPoint + t * (in.farPoint - in.nearPoint);

    // Grid rendering logic
    let coord = fragPos3D.xz;
    
    // Anti-aliased grid lines using screen space derivatives
    let derivative = fwidth(coord);
    let grid = abs(fract(coord - 0.5) - 0.5) / derivative;
    let line = min(grid.x, grid.y);
    
    var color = vec4<f32>(0.2, 0.2, 0.2, 1.0 - min(line, 1.0));

    let zDist = abs(fragPos3D.x);
    let zThickness = 1.0 * derivative.x;
    let zAxis = 1.0 - smoothstep(0.0, zThickness, zDist);

    let xDist = abs(fragPos3D.z);
    let xThickness = 1.0 * derivative.y;
    let xAxis = 1.0 - smoothstep(0.0, xThickness, xDist);

    if (zAxis > 0.0) {
        color = mix(color, vec4<f32>(0.2, 0.2, 1.0, 1.0), zAxis);
    }
    if (xAxis > 0.0) {
        color = mix(color, vec4<f32>(1.0, 0.2, 0.2, 1.0), xAxis);
    }

    // Fading at a distance
    let linearDepth = length(fragPos3D - u.cameraPos.xyz);
    let fadeStart = 10.0;
    let fadeEnd = 100.0;
    let fading = clamp(1.0 - (linearDepth - fadeStart) / (fadeEnd - fadeStart), 0.0, 1.0);
    color.a = color.a * fading;

    if (color.a < 0.01) {
        discard;
    }

    // Calculate depth for depth buffer
    var clip_space_pos = u.viewProj * vec4<f32>(fragPos3D, 1.0);
    let ndc_depth = clip_space_pos.z / clip_space_pos.w;
    
    var out: FragmentOutput;
    out.color = color;
    out.depth = ndc_depth;
    
    return out;
}
