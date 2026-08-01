#include "renderer/ShaderLoader.h"
#include <fstream>
#include <sstream>
#include <iostream>

namespace renderer {
    std::string ShaderLoader::load(const std::string& filepath) {
        std::ifstream file(filepath);
        if (!file.is_open()) {
            std::cerr << "Failed to open shader file: " << filepath << std::endl;
            return "";
        }
        std::stringstream buffer;
        buffer << file.rdbuf();
        return buffer.str();
    }
}
