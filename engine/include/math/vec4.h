#pragma once

namespace math {
    struct vec4 {
        float x, y, z, w;

        vec4() : x(0), y(0), z(0), w(0) {}
        vec4(float x, float y, float z, float w) : x(x), y(y), z(z), w(w) {}
    };
}
