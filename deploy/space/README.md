---
title: Q-Captain: Learning the Ropes
emoji: ⛵
colorFrom: yellow
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
short_description: API y simulación en vivo de un barco que aprende con RL
---

# Q-Captain: Learning the Ropes · backend

API FastAPI y WebSockets de la simulación. La web (Next.js) se despliega aparte en Vercel
y se conecta aquí. Los orígenes permitidos se configuran con la variable `CORS_ORIGINS`
en los ajustes del Space.

- Salud: `/api/health`
- Modelos: `/api/runs`
- Documentación: `/docs`
