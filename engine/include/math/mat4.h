#pragma once

namespace math {
    struct mat4 {
        float m[16]; // Column-major

        static mat4 identity() {
            mat4 res = {};
            res.m[0]  = 1.0f; res.m[1]  = 0.0f; res.m[2]  = 0.0f; res.m[3]  = 0.0f;
            res.m[4]  = 0.0f; res.m[5]  = 1.0f; res.m[6]  = 0.0f; res.m[7]  = 0.0f;
            res.m[8]  = 0.0f; res.m[9]  = 0.0f; res.m[10] = 1.0f; res.m[11] = 0.0f;
            res.m[12] = 0.0f; res.m[13] = 0.0f; res.m[14] = 0.0f; res.m[15] = 1.0f;
            return res;
        }
    };
}
