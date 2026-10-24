---
title: "Q-Captain: Learning the Ropes"
emoji: ⛵
colorFrom: yellow
colorTo: blue
sdk: gradio
sdk_version: 6.30.0
python_version: "3.12"
app_file: app.py
pinned: false
short_description: API y simulación en vivo de un barco que aprende con RL
---

# Q-Captain: Learning the Ropes · backend

API FastAPI y WebSockets de la simulación (el SDK Gradio solo se usa para ejecutar `app.py`,
que arranca el backend). La web (Next.js) se despliega aparte en Vercel
y se conecta aquí. Los orígenes permitidos se configuran con la variable `CORS_ORIGINS`
en los ajustes del Space.

- Salud: `/api/health`
- Modelos: `/api/runs`
- Documentación: `/docs`
