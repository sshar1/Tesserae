#pragma once

#include "vec3.h"
#include "vec4.h"
#include <cmath>
#include <cstring>

namespace math {
    struct mat4 {
        float m[16]; // Column-major

        mat4() {
            std::memset(m, 0, sizeof(m));
        }

        static mat4 identity() {
            mat4 res;
            res.m[0]  = 1.0f; res.m[5]  = 1.0f; res.m[10] = 1.0f; res.m[15] = 1.0f;
            return res;
        }

        mat4 operator*(const mat4& rhs) const {
            mat4 res;
            for (int col = 0; col < 4; ++col) {
                for (int row = 0; row < 4; ++row) {
                    res.m[col * 4 + row] = 
                        m[0 * 4 + row] * rhs.m[col * 4 + 0] +
                        m[1 * 4 + row] * rhs.m[col * 4 + 1] +
                        m[2 * 4 + row] * rhs.m[col * 4 + 2] +
                        m[3 * 4 + row] * rhs.m[col * 4 + 3];
                }
            }
            return res;
        }

        vec3 operator*(const vec3& rhs) const {
            vec3 res;
            res.x = m[0]*rhs.x + m[4]*rhs.y + m[8]*rhs.z + m[12];
            res.y = m[1]*rhs.x + m[5]*rhs.y + m[9]*rhs.z + m[13];
            res.z = m[2]*rhs.x + m[6]*rhs.y + m[10]*rhs.z + m[14];
            float w = m[3]*rhs.x + m[7]*rhs.y + m[11]*rhs.z + m[15];
            if (std::abs(w) > 0.00001f) {
                res.x /= w; res.y /= w; res.z /= w;
            }
            return res;
        }

        vec4 operator*(const vec4& rhs) const {
            vec4 res;
            res.x = m[0]*rhs.x + m[4]*rhs.y + m[8]*rhs.z + m[12]*rhs.w;
            res.y = m[1]*rhs.x + m[5]*rhs.y + m[9]*rhs.z + m[13]*rhs.w;
            res.z = m[2]*rhs.x + m[6]*rhs.y + m[10]*rhs.z + m[14]*rhs.w;
            res.w = m[3]*rhs.x + m[7]*rhs.y + m[11]*rhs.z + m[15]*rhs.w;
            return res;
        }

        static mat4 translation(const vec3& t) {
            mat4 res = identity();
            res.m[12] = t.x;
            res.m[13] = t.y;
            res.m[14] = t.z;
            return res;
        }

        static mat4 scaling(const vec3& s) {
            mat4 res = identity();
            res.m[0]  = s.x;
            res.m[5]  = s.y;
            res.m[10] = s.z;
            return res;
        }

        // WebGPU uses [0, 1] depth range
        static mat4 perspective(float fovY, float aspect, float zNear, float zFar) {
            mat4 res;
            float f = 1.0f / std::tan(fovY * 0.5f);
            res.m[0] = f / aspect;
            res.m[5] = f;
            res.m[10] = zFar / (zNear - zFar);
            res.m[11] = -1.0f;
            res.m[14] = (zNear * zFar) / (zNear - zFar);
            return res;
        }

        static mat4 orthographic(float left, float right, float bottom, float top, float zNear, float zFar) {
            mat4 res;
            res.m[0] = 2.0f / (right - left);
            res.m[5] = 2.0f / (top - bottom);
            res.m[10] = 1.0f / (zNear - zFar);
            res.m[12] = -(right + left) / (right - left);
            res.m[13] = -(top + bottom) / (top - bottom);
            res.m[14] = zNear / (zNear - zFar);
            res.m[15] = 1.0f;
            return res;
        }

        static mat4 lookAt(const vec3& eye, const vec3& center, const vec3& up) {
            vec3 f = (center - eye).normalize();
            vec3 s = vec3::cross(f, up).normalize();
            vec3 u = vec3::cross(s, f);

            mat4 res = identity();
            res.m[0] = s.x;
            res.m[4] = s.y;
            res.m[8] = s.z;
            res.m[1] = u.x;
            res.m[5] = u.y;
            res.m[9] = u.z;
            res.m[2] = -f.x;
            res.m[6] = -f.y;
            res.m[10] = -f.z;
            res.m[12] = -vec3::dot(s, eye);
            res.m[13] = -vec3::dot(u, eye);
            res.m[14] = vec3::dot(f, eye);
            return res;
        }

        mat4 inverse() const {
            mat4 inv;
            inv.m[0] = m[5]  * m[10] * m[15] - 
             m[5]  * m[11] * m[14] - 
             m[9]  * m[6]  * m[15] + 
             m[9]  * m[7]  * m[14] +
             m[13] * m[6]  * m[11] - 
             m[13] * m[7]  * m[10];

            inv.m[4] = -m[4]  * m[10] * m[15] + 
              m[4]  * m[11] * m[14] + 
              m[8]  * m[6]  * m[15] - 
              m[8]  * m[7]  * m[14] - 
              m[12] * m[6]  * m[11] + 
              m[12] * m[7]  * m[10];

            inv.m[8] = m[4]  * m[9] * m[15] - 
             m[4]  * m[11] * m[13] - 
             m[8]  * m[5] * m[15] + 
             m[8]  * m[7] * m[13] + 
             m[12] * m[5] * m[11] - 
             m[12] * m[7] * m[9];

            inv.m[12] = -m[4]  * m[9] * m[14] + 
               m[4]  * m[10] * m[13] +
               m[8]  * m[5] * m[14] - 
               m[8]  * m[6] * m[13] - 
               m[12] * m[5] * m[10] + 
               m[12] * m[6] * m[9];

            inv.m[1] = -m[1]  * m[10] * m[15] + 
              m[1]  * m[11] * m[14] + 
              m[9]  * m[2] * m[15] - 
              m[9]  * m[3] * m[14] - 
              m[13] * m[2] * m[11] + 
              m[13] * m[3] * m[10];

            inv.m[5] = m[0]  * m[10] * m[15] - 
             m[0]  * m[11] * m[14] - 
             m[8]  * m[2] * m[15] + 
             m[8]  * m[3] * m[14] + 
             m[12] * m[2] * m[11] - 
             m[12] * m[3] * m[10];

            inv.m[9] = -m[0]  * m[9] * m[15] + 
              m[0]  * m[11] * m[13] + 
              m[8]  * m[1] * m[15] - 
              m[8]  * m[3] * m[13] - 
              m[12] * m[1] * m[11] + 
              m[12] * m[3] * m[9];

            inv.m[13] = m[0]  * m[9] * m[14] - 
              m[0]  * m[10] * m[13] - 
              m[8]  * m[1] * m[14] + 
              m[8]  * m[2] * m[13] + 
              m[12] * m[1] * m[10] - 
              m[12] * m[2] * m[9];

            inv.m[2] = m[1]  * m[6] * m[15] - 
             m[1]  * m[7] * m[14] - 
             m[5]  * m[2] * m[15] + 
             m[5]  * m[3] * m[14] + 
             m[13] * m[2] * m[7] - 
             m[13] * m[3] * m[6];

            inv.m[6] = -m[0]  * m[6] * m[15] + 
              m[0]  * m[7] * m[14] + 
              m[4]  * m[2] * m[15] - 
              m[4]  * m[3] * m[14] - 
              m[12] * m[2] * m[7] + 
              m[12] * m[3] * m[6];

            inv.m[10] = m[0]  * m[5] * m[15] - 
              m[0]  * m[7] * m[13] - 
              m[4]  * m[1] * m[15] + 
              m[4]  * m[3] * m[13] + 
              m[12] * m[1] * m[7] - 
              m[12] * m[3] * m[5];

            inv.m[14] = -m[0]  * m[5] * m[14] + 
               m[0]  * m[6] * m[13] + 
               m[4]  * m[1] * m[14] - 
               m[4]  * m[2] * m[13] - 
               m[12] * m[1] * m[6] + 
               m[12] * m[2] * m[5];

            inv.m[3] = -m[1] * m[6] * m[11] + 
              m[1] * m[7] * m[10] + 
              m[5] * m[2] * m[11] - 
              m[5] * m[3] * m[10] - 
              m[9] * m[2] * m[7] + 
              m[9] * m[3] * m[6];

            inv.m[7] = m[0] * m[6] * m[11] - 
             m[0] * m[7] * m[10] - 
             m[4] * m[2] * m[11] + 
             m[4] * m[3] * m[10] + 
             m[8] * m[2] * m[7] - 
             m[8] * m[3] * m[6];

            inv.m[11] = -m[0] * m[5] * m[11] + 
               m[0] * m[7] * m[9] + 
               m[4] * m[1] * m[11] - 
               m[4] * m[3] * m[9] - 
               m[8] * m[1] * m[7] + 
               m[8] * m[3] * m[5];

            inv.m[15] = m[0] * m[5] * m[10] - 
              m[0] * m[6] * m[9] - 
              m[4] * m[1] * m[10] + 
              m[4] * m[2] * m[9] + 
              m[8] * m[1] * m[6] - 
              m[8] * m[2] * m[5];

            float det = m[0] * inv.m[0] + m[1] * inv.m[4] + m[2] * inv.m[8] + m[3] * inv.m[12];

            if (std::abs(det) < 0.00001f)
                return identity(); // Return identity if determinant is 0

            det = 1.0f / det;

            for (int i = 0; i < 16; i++)
                inv.m[i] = inv.m[i] * det;

            return inv;
        }
    };
}
