#include "scene.h"

#include <fstream>

#include "../gl_utils.h"
#include "mesh.h"

using namespace std;
using std::cout;
using std::endl;

namespace CS248 {
namespace DynamicScene {

namespace {

Matrix4x4 createPerspectiveMatrix(float fovy, float aspect, float near, float far) {

  float f = 1.0 / tan(radians(fovy)/2.0);

  Matrix4x4 m;
  m[0][0] = f / aspect;
  m[0][1] = 0.f;
  m[0][2] = 0.f;
  m[0][3] = 0.f;

  m[1][0] = 0.f;  
  m[1][1] = f;
  m[1][2] = 0.f;
  m[1][3] = 0.f;

  m[2][0] = 0.f;
  m[2][1] = 0.f;
  m[2][2] = (far + near) / (near - far);
  m[2][3] = -1.f;

  m[3][0] = 0.f;
  m[3][1] = 0.f;
  m[3][2] = (2.f * far * near) / (near - far);
  m[3][3] = 0.0;

  return m;
}

Matrix4x4 createWorldToCameraMatrix(const Vector3D& eye, const Vector3D& at, const Vector3D& up) {

  // TODO CS248 Part 1: Coordinate transform
  // Compute the matrix that transforms a point in world space to a point in camera space.
  
  auto n = (eye - at);
  n.normalize();
  auto u = cross(up, n);
  u.normalize();
  auto v = cross(n, u);
  v.normalize();

  auto tx = -dot(u, eye);
  auto ty = -dot(v, eye);
  auto tz = -dot(n, eye);

  Matrix4x4 m; // remember m is column major
  m[0][0] = u.x; m[1][0] = u.y; m[2][0] = u.z; m[3][0] = tx;
  m[0][1] = v.x; m[1][1] = v.y; m[2][1] = v.z; m[3][1] = ty;
  m[0][2] = n.x; m[1][2] = n.y; m[2][2] = n.z; m[3][2] = tz;
  m[0][3] = 0; m[1][3] = 0; m[2][3] = 0; m[3][3] = 1;
  return m;
}

// Creates two triangles (6 positions, 18 floats) making up a square
// The square uniformly samples the texture space (6 vertices, 12 floats).
// Returns the vertex position and texcoord buffers
std::pair<std::vector<float>, std::vector<float>> getTextureVizBuffers(float z) {
  std::vector<float> vtx = {
    -1, -1, z,
    1, -1, z,
    1, 1, z,
    -1, -1, z,
    1, 1, z,
    -1, 1, z
  };
  std::vector<float> texcoords = {
    0, 0,
    1, 0,
    1, 1,
    0, 0,
    1, 1,
    0, 1
  };
  return std::make_pair(vtx, texcoords);
}

}  // namespace


Scene::Scene(std::vector<SceneObject*> argObjects,
             std::vector<SceneLight*>  argLights,
             const std::string& baseShaderDir) {

    for (int i = 0; i < argObjects.size(); i++) {
        argObjects[i]->setScene(this);
        objects_.insert(argObjects[i]);
    }

    for (int i = 0; i < argLights.size(); i++) {
        lights_.insert(argLights[i]);
    }

    for (SceneLight* sl : lights_) {
        StaticScene::SceneLight* light = sl->getStaticLight();
        if (dynamic_cast<StaticScene::DirectionalLight*>(light)) {
            directionalLights_.push_back((StaticScene::DirectionalLight*)light);
        }
        if (dynamic_cast<StaticScene::PointLight*>(light)) {
            pointLights_.push_back((StaticScene::PointLight*)light);
        }
        if (dynamic_cast<StaticScene::SpotLight*>(light)) {
            spotLights_.push_back((StaticScene::SpotLight*)light);
            float delta = static_cast <float> (rand()) / static_cast <float> (RAND_MAX) * spotLightRotationSpeedRange_ - spotLightRotationSpeedRange_ / 2.0;
            spotLightRotationSpeeds_.push_back(delta);
        }
        // if (dynamic_cast<StaticScene::InfiniteHemisphereLight *>(light)) {
        //     hemiLights.push_back((StaticScene::InfiniteHemisphereLight*)light);
        // }
        // if (dynamic_cast<StaticScene::AreaLight*>(light)) {
        //     areaLights.push_back((StaticScene::AreaLight*)light);
        // }
    }

    // the following code creates frame buffer objects to render shadows

    checkGLError("pre shadow fb setup");

    doShadowPass_ = false;

    if (getNumShadowedLights() > 0) {

        printf("Setting up shadow assets\n");

        doShadowPass_ = true;
        shadowTextureSize_ = 1024;

        gl_mgr_ = GLResourceManager::instance();

        // one for forward and one for backward pass
        for (int i=0; i<2*getNumShadowedLights(); i++) {

          shadowFrameBufferId_[i] = gl_mgr_->createFrameBuffer();
	        checkGLError("after creating framebuffer");

        }
        cout << "Created " << 2*getNumShadowedLights() << " shadow framebuffers" << endl;
        std::tie(shadowDepthTextureArrayId_, shadowColorTextureArrayId_) = gl_mgr_->createDepthAndColorTextureArrayFromFrameBuffers(
            shadowFrameBufferId_, 2*getNumShadowedLights(), shadowTextureSize_);
        checkGLError("after binding shadow texture as attachment");

        // glDrawBuffer(GL_NONE); // No color buffer is drawn to
        // glReadBuffer(GL_NONE); // No color is read from

        for (int i=0; i<2*getNumShadowedLights();i++) {
            // sanity check
            if (!gl_mgr_->checkFrameBuffer(shadowFrameBufferId_[i])) {
                exit(1);
            }
        }

        printf("Done setting up shadow assets\n");

        checkGLError("post shadow framebuffer setup");
        
        printf("Creating shadow shaders\n");

        // create shader object for shadow passes
        string sepchar("/");
        shadowShader_ = new Shader(baseShaderDir + sepchar + "shadow_pass.vert",
                                  baseShaderDir + sepchar + "shadow_pass.frag");
        checkGLError("post shadow shader compile");
        

        // checkGLError("post shadow shader debug compile");
        shadowVizShader_ = new Shader(baseShaderDir + sepchar + "shadow_viz.vert",
                                     baseShaderDir + sepchar + "shadow_viz.frag");

        std::vector<float> vtx, texcoords;
        std::tie(vtx, texcoords) = getTextureVizBuffers(/*z=*/0.0);
        shadowVizVertexArrayId_ = gl_mgr_->createVertexArray();
        shadowVizVtxBufferId_ = gl_mgr_->createVertexBufferFromData(vtx.data(), vtx.size());
        shadowVizTexCoordBufferId_ = gl_mgr_->createVertexBufferFromData(texcoords.data(), texcoords.size());
        checkGLError("post shadow viz shader compile");

        printf("Shaders created.\n");
    }

    // create shader object for diffuse color passes
    string sepchar("/");
    diffuseColorTextureSize_ = 1024;
    gl_mgr_ = GLResourceManager::instance();
    diffuseColorFrameBufferId_ = gl_mgr_->createFrameBuffer();
    checkGLError("after creating diffuse color framebuffer");
    diffuseDepthTextureId_ = gl_mgr_->createDepthTextureFromFrameBuffer(diffuseColorFrameBufferId_, diffuseColorTextureSize_);
    checkGLError("after binding diffuse depth texture as attachment");
    diffuseColorTextureId_ = gl_mgr_->createColorTextureFromFrameBuffer(diffuseColorFrameBufferId_, diffuseColorTextureSize_);
    checkGLError("after binding diffuse color texture as attachment");
    // sanity check
    if (!gl_mgr_->checkFrameBuffer(diffuseColorFrameBufferId_)) {
        exit(1);
    }
    checkGLError("post diffuse color framebuffer setup");

    diffuseColorShader_ = new Shader(baseShaderDir + sepchar + "diffuse_color_pass.vert",
                                    baseShaderDir + sepchar + "diffuse_color_pass.frag");
    checkGLError("post diffuse color shader compile");

    checkGLError("returning from Scene::Scene");  
}

Scene::~Scene() { }

size_t Scene::getNumShadowedLights() const {
    // for now, assume all spotlights (up to SCENE_MAX_SHADOWED_LIGHTS) are shadowed
    return std::min((int)spotLights_.size(), SCENE_MAX_SHADOWED_LIGHTS);
}

BBox Scene::getBBox() const {
    BBox bbox;
    for (SceneObject *obj : objects_) {
        bbox.expand(obj->getBBox());
    }
    return bbox;
}

void Scene::reloadShaders() {

    checkGLError("begin Scene::reloadShaders");

    printf("Reloading all shaders.\n");

    // FIXME(kayvonf): this breaks the abstraction that the shader class is the only place
    // where shader program bindings are changed.  Fix this later.  We may not need it at all.
    glUseProgram(0);


    if (getNumShadowedLights() > 0) {
      shadowShader_->reload();
      shadowVizShader_->reload();
    }

    diffuseColorShader_->reload();

    for (SceneObject *obj : objects_)
        obj->reloadShaders();

    checkGLError("end Scene::reloadShaders");
}

void Scene::render() {
  
    checkGLError("begin Scene::render");

    Matrix4x4 worldToCamera = createWorldToCameraMatrix(camera_->getPosition(), camera_->getViewPoint(), camera_->getUpDir());
    Matrix4x4 proj = createPerspectiveMatrix(camera_->getVFov(), camera_->getAspectRatio(), camera_->getNearClip(), camera_->getFarClip());  
    Matrix4x4 worldToCameraNDC = proj * worldToCamera;

    for (SceneObject *obj : objects_)
        obj->draw(worldToCameraNDC);

    checkGLError("end Scene::render");

}

void Scene::renderDiffuseColorPass() {
    checkGLError("begin Scene::renderDiffuseColorPass");

    auto fb_bind = gl_mgr_->bindFrameBuffer(diffuseColorFrameBufferId_);


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

void Scene::renderShadowPass(int shadowedLightIndex) {

    checkGLError("begin shadow pass");

    Vector3D lightDir  = spotLights_[shadowedLightIndex]->direction;
    Vector3D lightPos  = spotLights_[shadowedLightIndex]->position;
    float    coneAngle = spotLights_[shadowedLightIndex]->angle;

    // I'm making the fovy (field of view in y direction) of the shadow map
    // rendering a bit larger than the cone angle just to be safe. Clamp at 60 degrees.
    float fovy = std::max(1.4f * coneAngle, 60.0f);
    float aspect = 1.0f;
    float near = 10.f;
    float far = 400.;

	auto fb_bind = gl_mgr_->bindFrameBuffer(shadowFrameBufferId_[2*shadowedLightIndex]);

	Matrix4x4 worldToLight = createWorldToCameraMatrix(lightPos, lightPos + lightDir, Vector3D(0, 1, 0));
	Matrix4x4 proj = createPerspectiveMatrix(fovy, aspect, near, far);
	Matrix4x4 worldToLightNDC = proj * worldToLight;

	Matrix4x4 normalizeToCube; // remember in column major
	normalizeToCube[0] = Vector4D(0.5, 0, 0, 0);
	normalizeToCube[1] = Vector4D(0, 0.5, 0, 0);
	normalizeToCube[2] = Vector4D(0, 0, 0.5, 0);
	normalizeToCube[3] = Vector4D(0.5, 0.5, 0.5, 1);
	worldToShadowLight_[2*shadowedLightIndex] = normalizeToCube * worldToLightNDC;
    // 

    glViewport(0, 0, shadowTextureSize_, shadowTextureSize_);

    glClear(GL_DEPTH_BUFFER_BIT | GL_COLOR_BUFFER_BIT);
    glEnable(GL_DEPTH_TEST);

    // Now draw all the objects in the scene
    for (SceneObject *obj : objects_)
        obj->drawShadow(worldToLightNDC);

    checkGLError("end shadow pass");


    // render from negative direction
    Vector3D newLightDir = -lightDir;
    Vector3D newLightPos = lightPos + lightDir * 1000;
    auto fb_bind2 = gl_mgr_->bindFrameBuffer(shadowFrameBufferId_[2*shadowedLightIndex+1]);

	worldToLight = createWorldToCameraMatrix(newLightPos, newLightPos + newLightDir, Vector3D(0, 1, 0));
	proj = createPerspectiveMatrix(fovy, aspect, near, far);
	worldToLightNDC = proj * worldToLight;

	normalizeToCube[0] = Vector4D(0.5, 0, 0, 0);
	normalizeToCube[1] = Vector4D(0, 0.5, 0, 0);
	normalizeToCube[2] = Vector4D(0, 0, 0.5, 0);
	normalizeToCube[3] = Vector4D(0.5, 0.5, 0.5, 1);
	worldToShadowLight_[2*shadowedLightIndex+1] = normalizeToCube * worldToLightNDC;
    // 

    glViewport(0, 0, shadowTextureSize_, shadowTextureSize_);

    glClear(GL_DEPTH_BUFFER_BIT | GL_COLOR_BUFFER_BIT);
    glEnable(GL_DEPTH_TEST);

    // Now draw all the objects in the scene
    for (SceneObject *obj : objects_)
        obj->drawShadow(worldToLightNDC);

    checkGLError("end 2nd shadow pass");
    
}

void Scene::visualizeShadowMap() {
    checkGLError("pre viz shadow map");

    auto vertex_array_bind = gl_mgr_->bindVertexArray(shadowVizVertexArrayId_);
    auto shader_bind = shadowVizShader_->bind();
    shadowVizShader_->setVertexBuffer("vtx_position", 3, shadowVizVtxBufferId_);
    shadowVizShader_->setVertexBuffer("vtx_texcoord", 2, shadowVizTexCoordBufferId_);
    shadowVizShader_->setTextureArraySampler("depthTextureArray", shadowDepthTextureArrayId_);
    shadowVizShader_->setTextureArraySampler("colorTextureArray", shadowColorTextureArrayId_);
    // now issue the draw command to OpenGL
    checkGLError("before glDrawArrays for shadow viz");
    // 6 indices, 2 triangles to render
    glDrawArrays(GL_TRIANGLES, /*first=*/0, /*count=*/6);

    checkGLError("post viz shadow map");
}

void Scene::rotateSpotLights() {
  for (int i = 0; i < getNumSpotLights(); ++i) {
    spotLights_[i]->rotate(spotLightRotationSpeeds_[i]);
  }
}

}  // namespace DynamicScene
}  // namespace CS248
