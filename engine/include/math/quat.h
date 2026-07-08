#pragma once

#include "vec3.h"
#include "mat4.h"
#include <cmath>

namespace math {
    struct quat {
        float x, y, z, w;

        quat() : x(0), y(0), z(0), w(1) {}
        quat(float x, float y, float z, float w) : x(x), y(y), z(z), w(w) {}

        static quat identity() { return quat(0, 0, 0, 1); }

        static quat fromAxisAngle(const vec3& axis, float angle) {
            float halfAngle = angle * 0.5f;
            float s = std::sin(halfAngle);
            return quat(axis.x * s, axis.y * s, axis.z * s, std::cos(halfAngle));
        }

        quat operator*(const quat& q) const {
            return quat(
                w * q.x + x * q.w + y * q.z - z * q.y,
                w * q.y - x * q.z + y * q.w + z * q.x,
                w * q.z + x * q.y - y * q.x + z * q.w,
                w * q.w - x * q.x - y * q.y - z * q.z
            );
        }

        quat normalize() const {
            float lenSq = x*x + y*y + z*z + w*w;
            if (lenSq > 0.00001f) {
                float invLen = 1.0f / std::sqrt(lenSq);
                return quat(x * invLen, y * invLen, z * invLen, w * invLen);
            }
            return identity();
        }

        mat4 toMat4() const {
            mat4 res = mat4::identity();
            float xx = x * x, yy = y * y, zz = z * z;
            float xy = x * y, xz = x * z, yz = y * z;
            float wx = w * x, wy = w * y, wz = w * z;

            res.m[0] = 1.0f - 2.0f * (yy + zz);
            res.m[1] = 2.0f * (xy + wz);
            res.m[2] = 2.0f * (xz - wy);
            
            res.m[4] = 2.0f * (xy - wz);
            res.m[5] = 1.0f - 2.0f * (xx + zz);
            res.m[6] = 2.0f * (yz + wx);
            
            res.m[8] = 2.0f * (xz + wy);
            res.m[9] = 2.0f * (yz - wx);
            res.m[10] = 1.0f - 2.0f * (xx + yy);

            return res;
        }

        static float dot(const quat& a, const quat& b) {
            return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
        }

        static quat slerp(const quat& a, quat b, float t) {
            float cosTheta = dot(a, b);
            
            if (cosTheta < 0.0f) {
                b = quat(-b.x, -b.y, -b.z, -b.w);
                cosTheta = -cosTheta;
            }

            if (cosTheta > 0.9995f) {
                return quat(
                    a.x + t * (b.x - a.x),
                    a.y + t * (b.y - a.y),
                    a.z + t * (b.z - a.z),
                    a.w + t * (b.w - a.w)
                ).normalize();
            }

            float theta = std::acos(cosTheta);
            float sinTheta = std::sin(theta);
            
            float s0 = std::sin((1.0f - t) * theta) / sinTheta;
            float s1 = std::sin(t * theta) / sinTheta;

            return quat(
                a.x * s0 + b.x * s1,
                a.y * s0 + b.y * s1,
                a.z * s0 + b.z * s1,
                a.w * s0 + b.w * s1
            );
        }
    };
}
