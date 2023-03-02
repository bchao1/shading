 struct a2v {   float4 pos    : POSITION;   float3 normal : NORMAL; }; 
 struct v2f {   float4 hpos : POSITION;   float  dist : TEXCOORD0; // distance from light }; 
v2f main(a2v IN,          
uniform float4x4 modelViewProj,          
uniform float4x4 modelView,          
uniform float    grow) {   
    v2f OUT;   
    float4 P = IN.pos;   
    P.xyz += IN.normal * grow;  // scale vertex along normal   
    OUT.hpos = mul(modelViewProj, P);   
    OUT.dist = length(mul(modelView, IN.pos));   
return OUT; } 


 // Given a point in object space, lookup into depth textures 
   // returns depth 
   float trace(float3 P,            
   uniform float4x4  lightTexMatrix, // to light texture space     
   uniform float4x4  lightMatrix,    // to light space    
    uniform sampler2D lightDepthTex,             ) {   // transform point into light texture space    
    float4 texCoord = mul(lightTexMatrix, float4(P, 1.0)); // get distance from light at entry point     
    float d_i = tex2Dproj(lightDepthTex, texCoord.xyw); // transform position to light space     
    float4 Plight = mul(lightMatrix, float4(P, 1.0)); // distance of this pixel from light (exit)     
    float d_o = length(Plight); // calculate depth     
    float s = d_o - d_i;   return s; } 



