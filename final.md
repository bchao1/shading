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

## Proposal

I will survey real-time SSS algorithms, implement them, and compare their performances. I will implement the algorithms described in the following papers (or more), depending on time:

1. Green, Simon (2004). "Real-time Approximations to Subsurface Scattering". GPU Gems. Addison-Wesley Professional: 263–278. - **Depth Map-based SSS**
2. Borshukov, G; Lewis, J. P. (2005). "Realistic human face rendering for "The Matrix Reloaded"" (PDF). Computer Graphics. ACM Press - **Texture Space Diffusion**
3. Golubev, E. (2018). "Efficient Screen-Space Subsurface Scattering Using Burley's Normalized Diffusion in Real-Time", SIGGRAPH 2018 Courses - **Enhanced Depth Map-based SSS**

## References
- [GPU Gems Chapter 16. Real-Time Approximations to Subsurface Scattering](https://developer.nvidia.com/gpugems/gpugems/part-iii-materials/chapter-16-real-time-approximations-subsurface-scattering)
- [Real-Time Subsurface Scattering](https://observablehq.com/@devon-gadarowski/real-time-subsurface-scattering)
- [An Introduction to Real-Time Subsurface Scattering](https://therealmjp.github.io/posts/sss-intro/)
- [Efficient Screen-Space Subsurface Scattering Using Burley's Normalized Diffusion in Real-Time](https://advances.realtimerendering.com/s2018/Efficient%20screen%20space%20subsurface%20scattering%20Siggraph%202018.pdf)
- [Approximate Reflectance Profiles for Efficient Subsurface Scattering](https://graphics.pixar.com/library/ApproxBSSRDF/paper.pdf)
- [Extending the Disney BRDF to a BSDF with Integrated Subsurface Scattering](https://blog.selfshadow.com/publications/s2015-shading-course/burley/s2015_pbs_disney_bsdf_notes.pdf)
- [Physically Based Shading at Disney](https://media.disneyanimation.com/uploads/production/publication_asset/48/asset/s2012_pbs_disney_brdf_notes_v3.pdf)
- [A Practical Model for Subsurface Light Transport](https://graphics.stanford.edu/papers/bssrdf/bssrdf.pdf)