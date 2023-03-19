# CS248A Final Project: Real-Time Subsurface Scattering

## Author
Brian Chao | brianchc@stanford.edu 

## Introduction 
In HW3: Lighting and Materials in GLSL, we used a simple Phong reflectance model to model lighting. However, this simple model assumes that all materials are opaque and the reflected light leaves the surface exactly where it entered, as shown in the following figure:

![sss_local](figures/sss_entry.png)

However, many materials are translucent in real life, meaning that light can penetrate a nonzero length into the surface. These light diffuse inside of the material, and exits the surface at some point way from the initial entry point, as shown in the following figure:

![sss_nonlocal](figures/sss_nonlocal.png)

This physical behaviour generates the following appearance for textures like jade, marble, or human skin:

![sss_bust](figures/bust_sss.jpeg)

To correctly model this behaviour, the ultimate method is to use path tracing to directly model the light paths scattering inside of the material. However, this leads to long render time and is undesirable for real-time rendering. In this final project, I will implement several real-time subsurface scattering (abbreviated as SSS in the following) algorithms that allows for real-time rendering of translucent surfaces.

## Results

### Original Shading (without SSS)

![](figures/original.png)

### + Wrapping

![](figures/wrap.png)

### + Screen-space SSS

![](figures/sssss.png)

### + Translucency Approximation (**Final Result**)

![](figures/translucency.png)

### SSS using Spherical Gaussians

## Algorithms and Implementations

In the following sections, I will abbreviate subsurface scattering as "SSS". Three algorithms are combined and tuned in order to create a nice subsurface scattering look. 

1. The **wrapping** algorithm is used to model the ligth scattering behavior around edges and light borders (where L * N approaches 0). 
2. The **screen-space SSS** is used to model arbitrary scattering beneath the surfaces.
3. The **translucency approximation** is used to model light travelling from the back of the object to the front.
   
Finally, a stand-alone method to approximate subsurface scattering using spherical Gaussians is introduced.

### Wrapping
The most basic approximation of subsufrace scattering.

```glsl
// Phong shading with wrapping
vec3 Phong_BRDF(vec3 L, vec3 V, vec3 N, vec3 diffuse_color, vec3 specular_color, float specular_exponent)
{
    vec3 l = normalize(L);
    vec3 v = normalize(V);
    vec3 n = normalize(N);
    
    float wrap = 0.25;
    vec3 diffuse_component;
    diffuse_component = diffuse_color * max((dot(l, n) + wrap) / (1.0 + wrap), 0);

    return diffuse_component;
}
```

### Screen-space SSS

The core idea of subsurface scattering is that light entering a surface point of an object might leave the object at different surface points. This means light entering at a single surface point contributes to the irradiance of pixels at different locations across the surface. This essentially translates to blurring the irradiance of the pixels across the surface with a specific kernel, which is often referred to as the diffusion profile of a material.
    
Different approaches have been proposed to perform this convolution, including texture-space diffusion (paper), screen-space subsufrace scattering, and etc. (talk about why other approaches does not work well and screen space SSS is good).
   
To perform screen-space SSS, we need to perform multiple shader passes. The reason is that you can only compute the irradiance at **one fragment position** in a single pass. To accumulate irradiance values of neighboring pixels, you need to do two passes: the first pass computes the irradiance of each fragment and stores them in a texture map, and the second pass **samples multiple locations** in this texture map and accumulates the irradiance values to compute the irradiance value of a sinlge fragment. 
   
To extend the shader in HW3, we allocate a framebuffer `diffuseColorFrameBufferId_` and create texture maps `diffuseDepthTextureId_` and `diffuseColorTextureId_` that binds to this buffer. This is the buffer we will write to in our second shader pass where we compute the diffuse lighting.
```c++
diffuseColorTextureSize_ = 1024;
gl_mgr_ = GLResourceManager::instance();
diffuseColorFrameBufferId_ = gl_mgr_->createFrameBuffer();
diffuseDepthTextureId_ = gl_mgr_->createDepthTextureFromFrameBuffer(diffuseColorFrameBufferId_, diffuseColorTextureSize_);
diffuseColorTextureId_ = gl_mgr_->createColorTextureFromFrameBuffer(diffuseColorFrameBufferId_, diffuseColorTextureSize_);
if (!gl_mgr_->checkFrameBuffer(diffuseColorFrameBufferId_)) {
    exit(1);
}
checkGLError("post diffuse color framebuffer setup");
diffuseColorShader_ = new Shader(baseShaderDir + sepchar + "diffuse_color_pass.vert",
                                baseShaderDir + sepchar + "diffuse_color_pass.frag");
```
    
The first pass is the same shadow pass as in HW3, where the shadow maps are computed. The shaders that correspond to this pass are `shadow_pass.vert` and `shadow_pass.frag`.
   
The second pass evaluates the diffuse component of each fragment and stores them in a texture map. An additional diffuse component due to translucency is also included. This pass is very similar to the normal shading procedure, only that the irradiance values are written to the framebuffer `diffuseColorFrameBufferId_`, not the usual screen buffer. The shaders that correspond to this pass are `diffuse_color_pass.vert` and `diffuse_color_pass.frag`.
```c++
void Scene::renderDiffuseColorPass() {
    checkGLError("begin Scene::renderDiffuseColorPass");
    auto fb_bind = gl_mgr_->bindFrameBuffer(diffuseColorFrameBufferId_); // write to diffuseColorFrameBuffer other than screen buffer

    Matrix4x4 worldToCamera = createWorldToCameraMatrix(camera_->getPosition(), camera_->getViewPoint(), camera_->getUpDir());
    Matrix4x4 proj = createPerspectiveMatrix(camera_->getVFov(), camera_->getAspectRatio(), camera_->getNearClip(), camera_->getFarClip());  
    Matrix4x4 worldToCameraNDC = proj * worldToCamera;

    glViewport(0, 0, diffuseColorTextureSize_, diffuseColorTextureSize_);

    glClear(GL_DEPTH_BUFFER_BIT | GL_COLOR_BUFFER_BIT);
    glEnable(GL_DEPTH_TEST);
    glEnable(GL_CULL_FACE);  // hack


    for (SceneObject *obj : objects_)
        obj->drawDiffuseColor(worldToCameraNDC);

    checkGLError("end Scene::renderDiffuseColorPass");
}
```
   
The final pass samples the texture map `diffuseColorTextureId_` at multiple screen locations and accumulates the sampled irradiance values to compute the resulting diffuse irradiance at a single fragment position. The specular component is computed in this pass since subsurface scattering does not effect specular lighting.  
```glsl
// inside shader_shadow.frag

vec2 uv = NDC_pos.xy / NDC_pos.w * 0.5 + 0.5; // convert NDC coordinate to [0, 1] for texture sampling

vec3 color = texture(diffuseColorTextureSampler, uv).rgb;  // sample texture color

// multiple blur passes to accumulate irradiance from nearby pixels
color = BlurPS(uv, color, vec2(1, 0));
color = BlurPS(uv, color, vec2(1, 0.5));
color = BlurPS(uv, color, vec2(1, 1));
color = BlurPS(uv, color, vec2(0.5, 1));
color = BlurPS(uv, color, vec2(0, 1));
```

The blurring function in `shader_shadow.frag` is defined below:
```glsl
vec3 BlurPS(vec2 uv, vec3 color, vec2 step_)
{
    float w[6] = float[]( 0.006,   0.061,   0.242,  0.242,  0.061, 0.006 );
    float o[6] = float[](  -1.0, -0.6667, -0.3333, 0.3333, 0.6667,   1.0 );

    vec3 colorM = color;

    vec3 colorBlurred = colorM;
    colorBlurred.rgb *= 0.382;

    step_ = normalize(step_);
    vec2 finalStep = step_ * 0.0025;

    for (int i = 0; i < 6; i++) {
        vec2 offset = uv + o[i] * finalStep;
        vec3 sample_color = texture(diffuseColorTextureSampler, offset).rgb;
        colorBlurred.rgb += w[i] * sample_color;
    }

    return colorBlurred;
}
```
![multiple blurring passes](./)


### Translucency Approximation

Other than scattering that happens at the surface of an object, semi-transparent objects also has non-zero transmission coefficients, meaning that light coming from the back of the object could also potentially reach the other side of the object. We use the following code to simulate this phenomenon:
```glsl
// in diffuse_color_pass.frag
float SSSDistortion = 1.0;
float SSSScale = 0.5;
float SSSPower = 2.0;
float thickness = 0.5; // better to use thickness texture maps or directly compute thickness on the fly, but we just use a constant here
vec3  SSSLightDir = L + N * SSSDistortion;
float SSSDot = pow(clamp(dot(-SSSLightDir, V), 0.0, 1.0), SSSPower) * SSSScale;
float SSSAmbient = 0.1;
float translucentComponent = (SSSDot + SSSAmbient) * thickness;
float translucentColor = translucentComponent * diffuseColor;
```
The effect of each component is illustrated in the figure below:

![translucency]()

- `SSSDistortion`
- `SSSScale`
- `SSSPower`
- `SSSLightDir`
- `SSSDot`
- `SSSAmbient`

### SSS with Spherical Gaussians

## References
- [GPU Gems Chapter 16. Real-Time Approximations to Subsurface Scattering](https://developer.nvidia.com/gpugems/gpugems/part-iii-materials/chapter-16-real-time-approximations-subsurface-scattering)
- [Real-Time Subsurface Scattering](https://observablehq.com/@devon-gadarowski/real-time-subsurface-scattering)
- [An Introduction to Real-Time Subsurface Scattering](https://therealmjp.github.io/posts/sss-intro/)
- [Efficient Screen-Space Subsurface Scattering Using Burley's Normalized Diffusion in Real-Time](https://advances.realtimerendering.com/s2018/Efficient%20screen%20space%20subsurface%20scattering%20Siggraph%202018.pdf)
- [Approximate Reflectance Profiles for Efficient Subsurface Scattering](https://graphics.pixar.com/library/ApproxBSSRDF/paper.pdf)
- [Extending the Disney BRDF to a BSDF with Integrated Subsurface Scattering](https://blog.selfshadow.com/publications/s2015-shading-course/burley/s2015_pbs_disney_bsdf_notes.pdf)
- [Physically Based Shading at Disney](https://media.disneyanimation.com/uploads/production/publication_asset/48/asset/s2012_pbs_disney_brdf_notes_v3.pdf)
- [A Practical Model for Subsurface Light Transport](https://graphics.stanford.edu/papers/bssrdf/bssrdf.pdf)


{
			"id" : "spotlight",
		    "name" : "main_spotlight",
			"type" : "spot",
            "position" : [0, 100, -100],
			"direction" : [0, -1, 1],
            "falloff_deg" : 20.0,
            "intensity" : [7500, 7500, 7500]
		}