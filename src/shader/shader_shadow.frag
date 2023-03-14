//
// Parameters that control fragment shader behavior. Different materials
// will set these flags to true/false for different looks
//

uniform bool useTextureMapping;     // true if basic texture mapping (diffuse) should be used
uniform bool useNormalMapping;      // true if normal mapping should be used
uniform bool useEnvironmentMapping; // true if environment mapping should be used
uniform bool useMirrorBRDF;         // true if mirror brdf should be used (default: phong)

//
// texture maps
//

uniform sampler2D diffuseTextureSampler;
uniform sampler2D normalTextureSampler;
uniform sampler2D environmentTextureSampler;
uniform sampler2DArray shadowTextureArraySampler;
uniform sampler2D diffuseColorTextureSampler; // for sampling diffuse color from texture array
uniform sampler2D diffuseDepthTextureSampler;

// TODO CS248 Part 3: Normal Mapping
// TODO CS248 Part 4: Environment Mapping

//
// lighting environment definition. Scenes may contain directional
// and point light sources, as well as an environment map
//

#define MAX_NUM_LIGHTS 10
 
uniform int  num_directional_lights;
uniform vec3 directional_light_vectors[MAX_NUM_LIGHTS];

uniform int  num_point_lights;
uniform vec3 point_light_positions[MAX_NUM_LIGHTS];

uniform int   num_spot_lights;
uniform vec3  spot_light_positions[MAX_NUM_LIGHTS];
uniform vec3  spot_light_directions[MAX_NUM_LIGHTS];
uniform vec3  spot_light_intensities[MAX_NUM_LIGHTS];
uniform float spot_light_angles[MAX_NUM_LIGHTS];

//
// material-specific uniforms
//

// parameters to Phong BRDF
uniform float spec_exp;

// values that are varying per fragment (computed by the vertex shader)

in vec3 position;     // surface position
in vec3 normal;
in vec2 texcoord;     // surface texcoord (uv)
in vec3 dir2camera;   // vector from surface point to camera
in mat3 tan2world;    // tangent space to world space transform
in vec3 vertex_diffuse_color; // surface color
in vec4 shadow_pos[3];   // shadow map position (5.2)
in vec4 NDC_pos; // NDC position
in vec3 obj_pos;
in vec3 obj_normal;

out vec4 fragColor;

#define PI 3.14159265358979323846


float random (vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}

vec3 Rd(vec3 scatterDistance, float radius)
{
  return (exp(-radius / scatterDistance) + exp(-radius / (scatterDistance * 3.0))) / (8.0 * PI * scatterDistance) / radius;
}

vec3 p(vec3 scatterDistance, float radius)
{
  return (exp(-radius / scatterDistance) + exp(-radius / (scatterDistance * 3.0))) / (8.0 * PI * scatterDistance);
}

float linearize_depth(float depth)
{
    float near_plane = 10.0;
    float far_plane = 400.0;
    float z = depth * 2.0 - 1.0; // Back to NDC 
    return (2.0 * near_plane * far_plane) / (far_plane + near_plane - z * (far_plane - near_plane));
}

//
// Fragment shader main entry point

void main(void)
{
    // sample the diffuse color texture map and add specular component
    
    vec2 uv = NDC_pos.xy / NDC_pos.w * 0.5 + 0.5;
    vec3 color = texture(diffuseColorTextureSampler, uv).rgb;    

    fragColor = vec4(color, 1);
    //fragColor = vec4(Lo, 1);
}



