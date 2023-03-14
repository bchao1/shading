//
// Parameters that control fragment shader behavior. Different materials
// will set these flags to true/false for different looks
//

uniform bool useTextureMapping;     // true if basic texture mapping (diffuse) should be used
uniform bool useNormalMapping;      // true if normal mapping should be used
uniform bool useEnvironmentMapping; // true if environment mapping should be used
uniform bool useMirrorBRDF;         // true if mirror brdf should be used (default: phong)
uniform bool useSubsurfaceScattering; // true if subsurface scattering should be used

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

vec3 diffusionSSS(vec2 uv, vec3 scatterDistance) {
  vec3 color = vec3(0.0);
  vec3 weight = vec3(0.0);
  float maxRadius = max(scatterDistance.x, max(scatterDistance.y, scatterDistance.z));
  for(int i = -5; i < 5; i++) {
      for(int j = -5; j < 5; j++){
        float radius_x = i * 0.0004;
        float radius_y = j * 0.0004;
        float radius = sqrt(radius_x * radius_x + radius_y * radius_y);
        vec3 diffusion = Rd(scatterDistance, radius);
        vec3 pdf = p(vec3(maxRadius), radius);
        vec2 sample_uv = uv + vec2(radius_x, radius_y);
        vec3 sample_color = texture(diffuseColorTextureSampler, sample_uv).rgb;
        color += diffusion * sample_color / pdf;
        weight += diffusion / pdf;
    }
  }
  return color / weight;
}

float linearize_depth(float depth)
{
    float near_plane = 10.0;
    float far_plane = 400.0;
    float z = depth * 2.0 - 1.0; // Back to NDC 
    return (2.0 * near_plane * far_plane) / (far_plane + near_plane - z * (far_plane - near_plane));
}

vec3 BlurPS(vec2 uv, vec3 color, vec2 step_)
{
    // Gaussian weights for the six samples around the current pixel:
    //   -3 -2 -1 +1 +2 +3
    float w[6] = float[]( 0.006,   0.061,   0.242,  0.242,  0.061, 0.006 );
    float o[6] = float[](  -1.0, -0.6667, -0.3333, 0.3333, 0.6667,   1.0 );

    // Fetch color and linear depth for current pixel:
    vec3 colorM = color;
    float depthM = texture(diffuseDepthTextureSampler, uv).r;

    // Accumulate center sample, multiplying it with its gaussian weight:
    vec3 colorBlurred = colorM;
    colorBlurred.rgb *= 0.382;

    // Calculate the step that we will use to fetch the surrounding pixels,
    // where "step" is:
    //     step = sssStrength * gaussianWidth * pixelSize * dir
    // The closer the pixel, the stronger the effect needs to be, hence
    // the factor 1.0 / depthM.
    vec2 finalStep = step_ * 0.002 / depthM;

    // Accumulate the other samples:
    for (int i = 0; i < 6; i++) {
        // Fetch color and depth for current sample:
        vec2 offset = uv + o[i] * finalStep;
        vec3 sample_color = texture(diffuseColorTextureSampler, offset).rgb;
        float depth = texture(diffuseDepthTextureSampler, offset).r;

        // If the difference in depth is huge, we lerp color back to "colorM":
        //float s = min(0.0125 * 1.0 * abs(depthM - depth), 1.0);
        //sample_color = mix(sample_color, colorM.rgb, s);

        // Accumulate:
        colorBlurred.rgb += w[i] * sample_color;
    }

    // The result will be alpha blended with current buffer by using specific 
    // RGB weights. For more details, I refer you to the GPU Pro chapter :)
    return colorBlurred;
}



//
// Simple diffuse brdf
//
// L -- direction to light
// N -- surface normal at point being shaded
//
vec3 Diffuse_BRDF(vec3 L, vec3 N, vec3 diffuseColor) {
    return diffuseColor * max(dot(N, L), 0.);
}

//
// Phong_BRDF --
//
// Evaluate phong reflectance model according to the given parameters
// L -- direction to light
// V -- direction to camera (view direction)
// N -- surface normal at point being shaded
//
vec3 Phong_BRDF(vec3 L, vec3 V, vec3 N, vec3 diffuse_color, vec3 specular_color, float specular_exponent)
{
    // TODO CS248 Part 2: Phong Reflectance
    // Implement diffuse and specular terms of the Phong
    // reflectance model here.
    vec3 l = normalize(L);
    vec3 v = normalize(V);
    vec3 n = normalize(N);

    vec3 r = 2 * dot(l, n) * n - l; // reflected ray
    r = normalize(r);
    
    // be careful to set the diffuse and specular components to zero if the dot product is negative
    
    float wrap = 0.0;
    vec3 diffuse_component;
    // normal diffuse
    diffuse_component = diffuse_color * max(dot(l, n), 0);

    vec3 specular_component;
    if (dot(r, v) > 0) {
        specular_component = specular_color * pow(dot(r, v), specular_exponent);
    } else {
        specular_component = vec3(0, 0, 0);
    }

    return diffuse_component;// + specular_component;
}

//
// SampleEnvironmentMap -- returns incoming radiance from specified direction
//
// D -- world space direction (outward from scene) from which to sample radiance
// 
vec3 SampleEnvironmentMap(vec3 D)
{    
    // TODO CS248 Part 4: Environment Mapping
    // sample environment map in direction D.  This requires
    // converting D into spherical coordinates where Y is the polar direction
    // (warning: in our scene, theta is angle with Y axis, which differs from
    // typical convention in physics)
    //
    // Tips:
    //
    // (1) See GLSL documentation of acos(x) and atan(x, y)
    //
    // (2) atan() returns an angle in the range -PI to PI, so you'll have to
    //     convert negative values to the range 0 - 2PI
    //
    // (3) How do you convert theta and phi to normalized texture
    //     coordinates in the domain [0,1]^2?

    float theta = acos(D.y / length(D)); // 0 - PI
    float phi = atan(D.x, D.z); // -PI - PI
    float u;
    u = (2 * PI - phi) / (2 * PI); // tricky! See README note.
    float v = theta / PI;
    vec3 color = texture(environmentTextureSampler, vec2(u, v)).rgb;
    return color;  
}

//
// Fragment shader main entry point
//
void main(void)
{

    //////////////////////////////////////////////////////////////////////////
	// Pattern generation. Compute parameters to BRDF 
    //////////////////////////////////////////////////////////////////////////
    
	vec3 diffuseColor = vec3(1.0, 1.0, 1.0);
    vec3 specularColor = vec3(1.0, 1.0, 1.0);
    float specularExponent = spec_exp;

    if (useTextureMapping) {
        diffuseColor = texture(diffuseTextureSampler, texcoord).rgb;
    } else {
        diffuseColor = vertex_diffuse_color;
    }

    // perform normal map lookup if required
    vec3 N = vec3(0);
    if (useNormalMapping) {
       // TODO: CS248 Part 3: Normal Mapping:
       // use tan2World in the normal map to compute the
       // world space normal baaed on the normal map.

       // Note that values from the texture should be scaled by 2 and biased
       // by negative -1 to covert positive values from the texture fetch, which
       // lie in the range (0-1), to the range (-1,1).
       //
       // In other words:   tangent_space_normal = texture_value * 2.0 - 1.0;

       // replace this line with your implementation
       vec3 texture_value = texture(normalTextureSampler, texcoord).rgb;
       vec3 tangent_space_normal = texture_value * 2.0 - 1.0;
       N = normalize(tan2world * tangent_space_normal);
    } else {
       N = normalize(normal);
    }

    vec3 V = normalize(dir2camera);
    vec3 Lo = vec3(0.1 * diffuseColor);   // this is ambient

    /////////////////////////////////////////////////////////////////////////
    // Phase 2: Evaluate lighting and surface BRDF 
    /////////////////////////////////////////////////////////////////////////

    if (useMirrorBRDF) {
        //
        // TODO: CS248 Environment Mapping:
        // compute perfect mirror reflection direction here.
        // You'll also need to implement environment map sampling in SampleEnvironmentMap()
        //
        vec3 R = 2 * dot(V, N) * N - V; // reflected ray
        R = normalize(R);


        // sample environment map
        vec3 envColor = SampleEnvironmentMap(R);
        
        // this is a perfect mirror material, so we'll just return the light incident
        // from the reflection direction
        fragColor = vec4(envColor, 1);
        return;
    }

	// for simplicity, assume all lights (other than spot lights) have unit magnitude
	float light_magnitude = 1.0;

	// for all directional lights
	for (int i = 0; i < num_directional_lights; ++i) {
	    vec3 L = normalize(-directional_light_vectors[i]);
		vec3 brdf_color = Phong_BRDF(L, V, N, diffuseColor, specularColor, specularExponent);
	    Lo += light_magnitude * brdf_color;
    }

    // for all point lights
    for (int i = 0; i < num_point_lights; ++i) {
		vec3 light_vector = point_light_positions[i] - position;
        vec3 L = normalize(light_vector);
        float distance = length(light_vector);
        vec3 brdf_color = Phong_BRDF(L, V, N, diffuseColor, specularColor, specularExponent);
        float falloff = 1.0 / (0.01 + distance * distance);
        Lo += light_magnitude * falloff * brdf_color;
    }

    // for all spot lights
	for (int i = 0; i < num_spot_lights; ++i) {
    
        vec3 intensity = spot_light_intensities[i];   // intensity of light: this is intensity in RGB
        vec3 light_pos = spot_light_positions[i];     // location of spotlight
        float cone_angle = spot_light_angles[i];      // spotlight falls off to zero in directions whose
                                                      // angle from the light direction is grester than
                                                      // cone angle. Caution: this value is in units of degrees!

        vec3 dir_to_surface = position - light_pos;
        float angle = acos(dot(normalize(dir_to_surface), spot_light_directions[i])) * 180.0 / PI;

        // TODO CS248 Part 5.1: Spotlight Attenuation: compute the attenuation of the spotlight due to two factors:
        // (1) distance from the spot light (D^2 falloff)
        // (2) attentuation due to being outside the spotlight's cone 
        //
        // Here is a description of what to compute:
        //
        // 1. Modulate intensity by a factor of 1/D^2, where D is the distance from the
        //    spotlight to the current surface point.  For robustness, it's common to use 1/(1 + D^2)
        //    to never multiply by a value greather than 1.
        //
        // 2. Modulate the resulting intensity based on whether the surface point is in the cone of
        //    illumination.  To achieve a smooth falloff, consider the following rules
        //    
        //    -- Intensity should be zero if angle between the spotlight direction and the vector from
        //       the light position to the surface point is greater than (1.0 + SMOOTHING) * cone_angle
        //
        //    -- Intensity should not be further attentuated if the angle is less than (1.0 - SMOOTHING) * cone_angle
        //
        //    -- For all other angles between these extremes, interpolate linearly from unattenuated
        //       to zero intensity. 
        //
        //    -- The reference solution uses SMOOTHING = 0.1, so 20% of the spotlight region is the smoothly
        //       facing out area.  Smaller values of SMOOTHING will create hard spotlights.

        float SMOOTHING = 0.1;
        float distance = length(dir_to_surface);
        intensity = intensity * (1 / (1 + distance * distance));
        if(angle > (1.0 + SMOOTHING) * cone_angle)
            intensity = vec3(0, 0, 0);
        else if(angle < (1.0 - SMOOTHING) * cone_angle)
            intensity = intensity;
        else
            intensity = intensity * (1 - (angle - (1 - SMOOTHING) * cone_angle) / (2 * SMOOTHING * cone_angle));


        // Render Shadows for all spot lights
        // TODO CS248 Part 5.2: Shadow Mapping: comute shadowing for spotlight i here 
        float shadow_factor = 0.0;
        float pcf_step_size = 256;
        for (int j = -2; j <= 2; j++) {
            for (int k = -2; k <= 2; k++) {
                vec2 offset = vec2(j,k) / pcf_step_size;
                // sample shadow map at shadow_uv + offset
                // and test if the surface is in shadow according to this sample
                vec2 shadow_uv = shadow_pos[i].xy / shadow_pos[i].w + offset;
                float depth = texture(shadowTextureArraySampler, vec3(shadow_uv, i)).x; // why x?
                float current_depth = shadow_pos[i].z / shadow_pos[i].w;
                if(current_depth > depth + 0.005) {
                    shadow_factor += 1.0;
                }
                    //intensity = vec3(0, 0, 0);
            }
        }
        shadow_factor /= 25.0;
        intensity *= (1 - shadow_factor);


	    vec3 L = normalize(-spot_light_directions[i]);
		  vec3 brdf_color = Phong_BRDF(L, V, N, diffuseColor, specularColor, specularExponent);

        //intensity = vec3(1.0);
	    Lo += intensity * brdf_color;
    }


    // sample the diffuse color texture map and add specular component
    
    vec2 uv = NDC_pos.xy / NDC_pos.w * 0.5 + 0.5;
    float depth = NDC_pos.z / NDC_pos.w * 0.5 + 0.5;
    // clamp to [0,1] to avoid artifacts when sampling outside of the texture
    uv = clamp(uv, 0.0, 1.0);
    vec3 color = texture(diffuseColorTextureSampler, uv).rgb;  
    for(int i = 0; i < 3; i++) {
        color = BlurPS(uv, color, vec2(1, 0));
        color = BlurPS(uv, color, vec2(0.707, 0.707));
        color = BlurPS(uv, color, vec2(0, 1));
    }

    //vec3 L = normalize(-spot_light_directions[i]);
    //vec3 specular_component = Phong_BRDF_specular(L, V, N, specularColor, specularExponent);
    
    vec3 scatterDistance = vec3(0.0002, 0.0002, 0.0002);
    vec3 scatterColor = diffusionSSS(uv, scatterDistance);

    if(useSubsurfaceScattering){
      fragColor = vec4(color, 1);
      fragColor = vec4(Lo, 1);
      //fragColor = vec4(scatterColor, 1);
    }
    else {
      fragColor = vec4(Lo, 1);
    }

    //fragColor = vec4(Lo, 1);
}


// depth always 1
// faces seems to be culled (face orientation is not correct)
// weird culling artifact when sampling
// faces orientation not correct after sampling??, but correct if not sampling




