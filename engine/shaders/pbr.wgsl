struct Uniforms {
    viewProj : mat4x4<f32>,
    model : mat4x4<f32>,
    cameraPos : vec4<f32>,
    albedoMetallic : vec4<f32>, 
    lightDirRoughness : vec4<f32>,
};

@group(0) @binding(0) var<uniform> u : Uniforms;

struct VertexInput {
    @location(0) position : vec3<f32>,
    @location(1) normal : vec3<f32>,
    @location(2) uv : vec2<f32>,
};

struct VertexOutput {
    @builtin(position) position : vec4<f32>,
    @location(0) worldPos : vec3<f32>,
    @location(1) normal : vec3<f32>,
    @location(2) uv : vec2<f32>,
};

@vertex
fn vs_main(in : VertexInput) -> VertexOutput {
    var out : VertexOutput;
    let worldPos = u.model * vec4<f32>(in.position, 1.0);
    out.worldPos = worldPos.xyz;
    out.position = u.viewProj * worldPos;
    out.normal = (u.model * vec4<f32>(in.normal, 0.0)).xyz;
    out.uv = in.uv;
    return out;
}

@fragment
fn fs_main(in : VertexOutput) -> @location(0) vec4<f32> {
    let N = normalize(in.normal);
    let L = normalize(u.lightDirRoughness.xyz);
    let V = normalize(u.cameraPos.xyz - in.worldPos);
    let H = normalize(V + L);

    let albedo = u.albedoMetallic.rgb;
    let metallic = u.albedoMetallic.a;
    let roughness = max(u.lightDirRoughness.a, 0.04);

    let NdotL = max(dot(N, L), 0.0);
    let NdotV = max(dot(N, V), 0.0);
    
    let ambientLight = vec3<f32>(0.03) + vec3<f32>(0.02) * N.y;
    let ambient = ambientLight * albedo;

    if (NdotL > 0.0) {
        let F0 = mix(vec3<f32>(0.04), albedo, metallic);
        let cosTheta = max(dot(H, V), 0.0);
        let F = F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);

        let a = roughness * roughness;
        let a2 = a * a;
        let NdotH = max(dot(N, H), 0.0);
        let num = a2;
        let denom = (NdotH * NdotH * (a2 - 1.0) + 1.0);
        let D = num / (3.14159 * denom * denom);

        let k = (roughness + 1.0) * (roughness + 1.0) / 8.0;
        let ggx1 = NdotV / (NdotV * (1.0 - k) + k);
        let ggx2 = NdotL / (NdotL * (1.0 - k) + k);
        let G = ggx1 * ggx2;

        let numerator = D * G * F;
        let denominator = 4.0 * NdotV * NdotL + 0.0001;
        let specular = numerator / denominator;

        let kD = (vec3<f32>(1.0) - F) * (1.0 - metallic);
        let color = ambient + (kD * albedo / 3.14159 + specular) * vec3<f32>(1.0) * NdotL;

        let finalColor = pow(color, vec3<f32>(1.0 / 2.2));
        return vec4<f32>(finalColor, 1.0);
    }

    return vec4<f32>(pow(ambient, vec3<f32>(1.0 / 2.2)), 1.0);
}
