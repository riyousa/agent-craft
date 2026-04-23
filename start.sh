#!/bin/bash

# 启动脚本 - 同时启动前后端

echo "启动系统代理..."

# 检查虚拟环境
if [ ! -d "agent-api/.venv" ] && [ ! -d ".venv" ]; then
    echo "虚拟环境不存在，请先创建"
    exit 1
fi

# 检查前端依赖
if [ ! -d "agent-page/node_modules" ]; then
    echo "安装前端依赖..."
    cd agent-page && npm install && cd ..
fi

# 启动后端
echo "启动后端服务..."
cd agent-api
if [ -d ".venv" ]; then
    source .venv/bin/activate
elif [ -d "../.venv" ]; then
    source ../.venv/bin/activate
fi
python main.py &
BACKEND_PID=$!
cd ..

# 等待后端启动
sleep 3

# 启动前端
echo "启动前端服务..."
cd agent-page
npm start &
FRONTEND_PID=$!
cd ..

echo ""
echo "服务已启动"
echo "  后端: http://localhost:8000"
echo "  前端: http://localhost:3000"
echo "  API文档: http://localhost:8000/docs"
echo ""
echo "按 Ctrl+C 停止所有服务"

trap "echo ''; echo '停止服务...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT
wait
