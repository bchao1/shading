//
// Parameters that control fragment shader behavior. Different materials
// will set these flags to true/false for different looks
//

uniform bool useTextureMapping;     // true if basic texture mapping (diffuse) should be used
uniform bool useNormalMapping;      // true if normal mapping should be used
uniform bool useEnvironmentMapping; // true if environment mapping should be used
uniform bool useMirrorBRDF;         // true if mirror brdf should be used (default: phong)
uniform bool useSubsurfaceScattering;

//
// texture maps
//

uniform sampler2D diffuseTextureSampler;
uniform sampler2D normalTextureSampler;
uniform sampler2D environmentTextureSampler;
uniform sampler2DArray shadowTextureArraySampler;

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
in vec3 vertex_diffuse_color; // surface color
in vec2 texcoord;     // surface texcoord (uv)
in vec3 dir2camera;   // vector from surface point to camera
in vec3 normal;
in mat3 tan2world;    // tangent space to world space transform
in vec4 shadow_pos[8];   // shadow map position (5.2)
//in float depth;

out vec4 fragColor;

#define PI 3.14159265358979323846


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
    
    float wrap = 0.25;
    vec3 diffuse_component;
    // normal diffuse
    diffuse_component = diffuse_color * max((dot(l, n) + wrap) / (1.0 + wrap), 0);

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
    

    //diffuseColor = vec3(1.0, 1.0, 1.0);

    // perform normal map lookup if required
    vec3 N = vec3(0);
    if (useNormalMapping) {
       vec3 texture_value = texture(normalTextureSampler, texcoord).rgb;
       vec3 tangent_space_normal = texture_value * 2.0 - 1.0;
       N = normalize(tan2world * tangent_space_normal);
    } else {
       N = normalize(normal);
    }

    vec3 V = normalize(dir2camera);
    vec3 Lo = vec3(0.0 * diffuseColor);   // this is ambient

    if (useMirrorBRDF) {
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
        float avg_front_depth = 0.0;
        for (int j = -2; j <= 2; j++) {
            for (int k = -2; k <= 2; k++) {
                vec2 offset = vec2(j,k) / pcf_step_size;
                // sample shadow map at shadow_uv + offset
                // and test if the surface is in shadow according to this sample
                vec2 shadow_uv = shadow_pos[2*i].xy / shadow_pos[2*i].w + offset;
                shadow_uv = clamp(shadow_uv, 0.0, 1.0);
                float depth = texture(shadowTextureArraySampler, vec3(shadow_uv, 2*i)).x; // why x?
                float current_depth = shadow_pos[2*i].z / shadow_pos[2*i].w;
                if(current_depth > depth + 0.005) {
                    shadow_factor += 1.0;
                }
                avg_front_depth = avg_front_depth + depth;
            }
        }
        avg_front_depth /= 25.0;
        shadow_factor /= 25.0;
        intensity *= (1 - shadow_factor);

        float avg_back_depth = 0.0;
        for (int j = -2; j <= 2; j++) {
            for (int k = -2; k <= 2; k++) {
                vec2 offset = vec2(j,k) / pcf_step_size;
                // sample shadow map at shadow_uv + offset
                // and test if the surface is in shadow according to this sample
                vec2 shadow_uv = shadow_pos[2*i+1].xy / shadow_pos[2*i+1].w + offset;
                shadow_uv = clamp(shadow_uv, 0.0, 1.0);
                float depth = texture(shadowTextureArraySampler, vec3(shadow_uv, 2*i+1)).x; // why x?
                float current_depth = shadow_pos[2*i+1].z / shadow_pos[2*i+1].w;
                if(current_depth < depth - 0.005) {
                    shadow_factor += 1.0;
                }
                avg_back_depth = avg_back_depth + depth;
            }
        }
        avg_back_depth /= 25.0;
        float total_depth = avg_front_depth + avg_back_depth;
        float thickness = (2 - total_depth) * 0.5;


	    vec3 L = normalize(-spot_light_directions[i]);
		vec3 brdf_color = Phong_BRDF(L, V, N, diffuseColor, specularColor, specularExponent);


        // sample random depth vector here!! To approximate local thickness
        // translucency and shadows
        // local curvature and thickness relationships?
        // use local curvature to approximate thickness
        if(useSubsurfaceScattering) {
            float SSSDistortion = 0.2;
            float SSSScale = 4;
            float SSSPower = 2.0;
            float transmittance = exp(-50*thickness);
            vec3 SSSLightDir = L + N * SSSDistortion;
            //SSSLightDir = normalize(SSSLightDir);
            float SSSDot = pow(clamp(dot(-SSSLightDir, V), 0.0, 1.0), SSSPower) * SSSScale;
            
            float SSSAmbient = 0.1;
            float translucentComponent = (SSSDot + SSSAmbient) * transmittance;
            vec3 translucentColor = translucentComponent * diffuseColor;
            Lo += translucentColor;
        }

	    Lo += intensity * brdf_color;
    }
    //Lo = vec3(1.0, 1.0, 1.0);
    fragColor = vec4(Lo, 1);
}



