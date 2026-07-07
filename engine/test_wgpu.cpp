#include <webgpu/webgpu_cpp.h>
#include <iostream>

int main() {
    wgpu::Instance instance = wgpu::CreateInstance();
    std::cout << "Instance created" << std::endl;
    return 0;
}
