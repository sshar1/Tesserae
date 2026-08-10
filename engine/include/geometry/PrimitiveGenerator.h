#pragma once

#include "Mesh.h"
#include "math/vec3.h"
#include <cmath>

namespace geometry {
    class PrimitiveGenerator {
    public:
        static Mesh createPlane(float width = 1.0f, float length = 1.0f) {
            Mesh mesh;
            float hw = width * 0.5f;
            float hl = length * 0.5f;

            mesh.vertices = {
                {math::vec3(-hw, 0.0f, -hl), math::vec3(0, 1, 0), 0.0f, 0.0f},
                {math::vec3( hw, 0.0f, -hl), math::vec3(0, 1, 0), 1.0f, 0.0f},
                {math::vec3( hw, 0.0f,  hl), math::vec3(0, 1, 0), 1.0f, 1.0f},
                {math::vec3(-hw, 0.0f,  hl), math::vec3(0, 1, 0), 0.0f, 1.0f}
            };

            mesh.indices = {
                0, 1, 2,
                0, 2, 3
            };

            return mesh;
        }

        static Mesh createCube(float size = 1.0f) {
            Mesh mesh;
            float hs = size * 0.5f;

            // 6 faces * 4 vertices = 24 vertices
            math::vec3 p[8] = {
                math::vec3(-hs, -hs,  hs),
                math::vec3( hs, -hs,  hs),
                math::vec3( hs,  hs,  hs),
                math::vec3(-hs,  hs,  hs),
                math::vec3(-hs, -hs, -hs),
                math::vec3( hs, -hs, -hs),
                math::vec3( hs,  hs, -hs),
                math::vec3(-hs,  hs, -hs)
            };

            math::vec3 n[6] = {
                math::vec3(0, 0, 1), math::vec3(1, 0, 0), math::vec3(0, 0, -1),
                math::vec3(-1, 0, 0), math::vec3(0, 1, 0), math::vec3(0, -1, 0)
            };

            int faces[6][4] = {
                {0, 1, 2, 3}, // Front
                {1, 5, 6, 2}, // Right
                {5, 4, 7, 6}, // Back
                {4, 0, 3, 7}, // Left
                {3, 2, 6, 7}, // Top
                {4, 5, 1, 0}  // Bottom
            };

            for (int i = 0; i < 6; ++i) {
                int base = i * 4;
                for (int j = 0; j < 4; ++j) {
                    float u = (j == 1 || j == 2) ? 1.0f : 0.0f;
                    float v = (j == 2 || j == 3) ? 1.0f : 0.0f;
                    mesh.vertices.push_back({p[faces[i][j]], n[i], u, v});
                }
                mesh.indices.push_back(base + 0);
                mesh.indices.push_back(base + 1);
                mesh.indices.push_back(base + 2);
                mesh.indices.push_back(base + 0);
                mesh.indices.push_back(base + 2);
                mesh.indices.push_back(base + 3);
            }

            return mesh;
        }

        static Mesh createSphere(float radius = 0.5f, int segments = 32, int rings = 16) {
            Mesh mesh;
            
            for (int y = 0; y <= rings; ++y) {
                float v = (float)y / (float)rings;
                float phi = v * 3.14159265359f;

                for (int x = 0; x <= segments; ++x) {
                    float u = (float)x / (float)segments;
                    float theta = u * 3.14159265359f * 2.0f;

                    float px = std::cos(theta) * std::sin(phi);
                    float py = std::cos(phi);
                    float pz = std::sin(theta) * std::sin(phi);

                    math::vec3 normal = math::vec3(px, py, pz);
                    math::vec3 position = normal * radius;

                    mesh.vertices.push_back({position, normal, u, v});
                }
            }

            for (int y = 0; y < rings; ++y) {
                for (int x = 0; x < segments; ++x) {
                    uint32_t p0 = (y * (segments + 1)) + x;
                    uint32_t p1 = p0 + 1;
                    uint32_t p2 = p0 + (segments + 1);
                    uint32_t p3 = p2 + 1;

                    mesh.indices.push_back(p0);
                    mesh.indices.push_back(p2);
                    mesh.indices.push_back(p1);

                    mesh.indices.push_back(p1);
                    mesh.indices.push_back(p2);
                    mesh.indices.push_back(p3);
                }
            }

            return mesh;
        }

        static Mesh createTorus(float mainRadius = 1.0f, float tubeRadius = 0.05f, int mainSegments = 32, int tubeSegments = 8) {
            Mesh mesh;
            
            for (int i = 0; i <= mainSegments; ++i) {
                float u = (float)i / mainSegments;
                float theta = u * 3.14159265359f * 2.0f;
                
                float cosTheta = std::cos(theta);
                float sinTheta = std::sin(theta);
                
                for (int j = 0; j <= tubeSegments; ++j) {
                    float v = (float)j / tubeSegments;
                    float phi = v * 3.14159265359f * 2.0f;
                    
                    float cosPhi = std::cos(phi);
                    float sinPhi = std::sin(phi);
                    
                    float x = (mainRadius + tubeRadius * cosPhi) * cosTheta;
                    float y = tubeRadius * sinPhi;
                    float z = (mainRadius + tubeRadius * cosPhi) * sinTheta;
                    
                    math::vec3 position(x, y, z);
                    
                    float nx = cosPhi * cosTheta;
                    float ny = sinPhi;
                    float nz = cosPhi * sinTheta;
                    
                    math::vec3 normal(nx, ny, nz);
                    mesh.vertices.push_back({position, normal, u, v});
                }
            }
            
            for (int i = 0; i < mainSegments; ++i) {
                for (int j = 0; j < tubeSegments; ++j) {
                    uint32_t p0 = (i * (tubeSegments + 1)) + j;
                    uint32_t p1 = p0 + 1;
                    uint32_t p2 = p0 + (tubeSegments + 1);
                    uint32_t p3 = p2 + 1;
                    
                    mesh.indices.push_back(p0);
                    mesh.indices.push_back(p2);
                    mesh.indices.push_back(p1);
                    
                    mesh.indices.push_back(p1);
                    mesh.indices.push_back(p2);
                    mesh.indices.push_back(p3);
                }
            }
            
            return mesh;
        }
    };
}
