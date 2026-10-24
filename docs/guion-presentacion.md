# Guion · Q-Captain: Learning the Ropes (≈ 10 min)

> Formato: lo que hay que **decir** en viñetas cortas y lo que hay que **hacer** en pantalla en `▶`.
> Tiempos orientativos entre corchetes. La demo (bloque 5) se puede intercalar con los bloques 3 y 4
> si se prefiere enseñar cada dificultad justo al explicarla.

---

## 1. Qué es el proyecto [1 min]

- Un **barco autónomo que aprende a navegar solo**: salir de un punto, esquivar rocas y llegar a una boya.
- Nadie le programa las reglas («si hay roca a la izquierda, gira a la derecha»): **aprende a base de
  prueba y error** con aprendizaje por refuerzo.
- El objetivo no era solo que funcionase, sino **ver cómo aprende**: guardamos el modelo cada pocos miles
  de pasos de entrenamiento y la web permite reproducir cualquier momento de su aprendizaje.
- Después lo complicamos con **cuatro dificultades** para ver qué le cuesta a un agente y qué necesita
  para superarlo.

▶ Abrir la web en Navegación con el modelo **1 · Mar en calma**, dejarlo navegando de fondo.

---

## 2. El entorno y el modelo [2 min]

**Qué ve el barco (observación)**
- 12 **rayos tipo lidar** en un abanico de 180° delante: a qué distancia hay roca en cada dirección.
- **Hacia dónde está la boya** (ángulo) y **a qué distancia**.
- Su propio **giro** y velocidad. En total, 17 números entre 0 y 1. No ve el mapa entero: solo eso.

▶ Activar **Rayos del sensor** (tecla `S`) para que se vea el abanico.

**Qué puede hacer (acciones)**: solo tres → girar a la izquierda, seguir recto o girar a la derecha.
La velocidad es constante y el giro tiene inercia, como un barco de verdad: no gira en seco.

**Cómo se le premia (recompensa)**
- **+** por cada metro que se acerca a la boya, **−** un poquito por cada paso (para que no se entretenga).
- **+100** al llegar, **−100** al chocar o salirse del mapa.

**El modelo: DQN (Deep Q-Network)**
- Una red neuronal (2 capas de 256) que, dada la observación, **estima cuánta recompensa futura** espera
  con cada una de las 3 acciones (el «valor Q»). El barco elige la de mayor valor.
- Aprende de su **experiencia guardada** (memoria de repetición): repasa jugadas pasadas mezcladas y ajusta
  sus estimaciones. Al principio explora al azar y poco a poco pasa a fiarse de lo aprendido.
- Probamos también PPO (otra familia de algoritmos) y DQN rindió igual o mejor en casi todo, así que nos
  quedamos con uno solo para comparar limpio.

▶ Señalar el panel **Cerebro del agente**: son las preferencias de la red por cada acción, en vivo.

---

## 3. Cómo aprende: de dar vueltas a llegar [1,5 min]

- Cada modelo se entrena unos **50.000–150.000 pasos** (minutos en un portátil, solo CPU).
- La **curva de aprendizaje** muestra el % de llegadas a la boya en escenarios de evaluación a lo largo
  del entrenamiento.

▶ En el panel **Modelo**, mover el deslizador **Momento del aprendizaje** a «Sin entrenar» → el barco
  gira sin rumbo o se estrella. Subir a ~10k → empieza a orientarse pero choca. Subir a «Mejor evaluación»
  → navega limpio. (También se puede hacer clic en un punto de la curva, o usar `[` y `]`.)

- Mensaje clave: **el mismo barco y el mismo escenario, solo cambia cuánto ha practicado**.

---

## 4. Las dificultades: qué añade cada una y qué aprendimos [3 min]

Resultados medidos en 200 escenarios aleatorios por modelo (el % del desplegable es la mejor evaluación
durante el entrenamiento, sobre 40 escenarios, y suele salir algo más alto).

| # | Modelo | Qué cambia | Resultado |
|---|---|---|---|
| 1 | Mar en calma | Problema base: 4–10 rocas | **~87 %** de llegadas |
| 2 | Sin pistas | Solo premio al llegar o chocar (recompensa escasa) | **~12 %**: casi no aprende |
| 3–4 | Corrientes (± sensor) | Corriente de 4–6,5 u/s que arrastra al barco | **~65–70 %**; el sensor no ayuda |
| 5–6 | Trampa en U (± GPS) | Arrecife en U entre salida y boya | **0 % → 31 % → 91 %** |
| 7–8 | Rocas a la deriva (± memoria) | Rocas que se mueven a 5–8 u/s | **~55 % → ~57 %** |

**2 · Sin pistas: la importancia de la recompensa**
- Sin la recompensa por acercarse, el barco solo recibe señal cuando llega por casualidad. Eso casi nunca
  pasa al principio, así que no sabe qué hizo bien. **Diseñar la recompensa es la mitad del problema.**
- Curiosidad: PPO aquí sí aprendía (~82 %); DQN, con exploración al azar, apenas encuentra la boya.

**3–4 · Corrientes: ver no siempre es entender**
- La corriente empuja al barco de lado. Sin sensor tiene que deducirla de cómo deriva (observabilidad parcial).
- Le dimos un **sensor de corriente** esperando que mejorase… y no lo hizo (69 % sin sensor vs 60 % con él,
  media de 3 entrenamientos). Con la corriente actual basta con corregir el rumbo sobre la marcha;
  la información extra hace la red más difícil de entrenar sin aportar tanto. **Más información no siempre es mejor.**

**5–6 · Trampa en U: el mínimo local**
- El camino recto lleva a un callejón. La recompensa «acércate a la boya» premia justo meterse en la U.
- El modelo de mar en calma: **0 %**, entra siempre. Entrenado en la trampa: **31 %**, a veces aprende a rodearla.
- La solución fue doble: **recompensa por ruta** (premiar acercarse por el camino navegable, no en línea recta)
  y un **sensor de ruta tipo GPS** que le indica hacia dónde está el camino bueno → **91 %**.
- Mensaje: **si la recompensa engaña, el agente optimiza el engaño.**

**7–8 · Rocas a la deriva: el tiempo importa**
- Con una sola «foto» de los rayos no se sabe hacia dónde se mueve una roca.
- Le dimos **memoria**: ve los últimos 4 instantes a la vez (*frame stacking*), así puede deducir el movimiento.
- Mejora poco (~55 % → ~57 %, dentro del ruido). Las rocas rápidas son difíciles de verdad; harían falta
  más entrenamiento o una red con memoria real (recurrente). **Resultado honesto: no todo se resuelve.**

---

## 5. Demo de funcionalidades [2 min, ampliable]

### Navegación
1. **Elegir modelo** en el desplegable (numerados por dificultad) y **condiciones del mar** (calma,
   corrientes, trampa en U, rocas a la deriva). El modelo puede probarse en un mar distinto al de su
   entrenamiento: p. ej. **1 · Mar en calma** en la **Trampa en U** → se mete en el callejón.
2. **Reproducción**: navegar/pausar (`Espacio`), paso a paso (`→`), repetir travesía (`Mayús+R`),
   escenario nuevo (`R`), velocidad (Lenta → Turbo), encadenar travesías.
3. **Editar la carta en vivo** (herramientas `1` `2` `3`): arrastrar rocas o la boya, añadir y borrar rocas.
   ▶ Poner una roca justo delante del barco y ver cómo la esquiva.
4. **Sin azar** activado: siempre la acción favorita; desactivado: la sortea según sus preferencias.
5. Paneles: **Travesía** (paso, retorno, distancia a la boya, historial de travesías), **Cerebro del agente**
   y **Aprendizaje** (curva clicable).

### Comparativa (tecla `C`)
1. **Dos barcos en la misma carta y el mismo escenario**, cada uno con su modelo y su checkpoint.
   ▶ Barco A: **5 · Trampa en U**; barco B: **6 · Trampa en U + GPS**; mar: Trampa en U. Navegar.
2. **Marcador acumulado** de arribadas, encallados y travesías sin rumbo (tiempo agotado).
3. **Torneo rápido** (`T`): simula 20, 50 o 100 escenarios en segundos, los mismos para ambos barcos,
   con las condiciones del mar elegidas. ▶ Lanzarlo y comentar el resultado.
4. Otras parejas que lucen: **1 · Mar en calma** sin entrenar vs mejor evaluación (el aprendizaje en directo),
   **7** vs **8** en rocas a la deriva.

### Extras
- Atajos de teclado (`?`), funciona en móvil y tableta, y se puede abrir desde el móvil en la misma wifi.

---

## 6. Stack técnico y cómo se comunica [1 min]

```
 Navegador (Next.js)  ⇄  WebSocket 30 Hz + API REST  ⇄  Backend (FastAPI)  →  Modelos DQN (PyTorch)
```

- **Entrenamiento**: Python, **Gymnasium** (el entorno del barco) y **Stable-Baselines3** (DQN) sobre
  **PyTorch** en CPU; **TensorBoard** para las curvas. Cada entrenamiento guarda checkpoints periódicos.
- **Backend**: **FastAPI**. La simulación corre en el servidor: cada pestaña abierta tiene su propia
  sesión, que avanza el entorno, pregunta al modelo qué acción tomar y envía el estado por **WebSocket**
  30 veces por segundo. Una API REST lista los modelos, sus checkpoints y sus curvas.
- **Frontend**: **Next.js + React**, con la carta pintada en un canvas a 60 fps (interpola entre estados
  para que se vea fluido). Los botones envían órdenes por el mismo WebSocket (pausar, mover una roca…).
- **Despliegue**: demo en la wifi desde el portátil; en internet, backend en Render y web en Vercel.

---

## 7. Cierre [30 s]

- Un agente que **aprende solo** a navegar y una web para **ver ese aprendizaje** y **compararlo**.
- Tres lecciones: **la recompensa lo es casi todo** (sin pistas, trampa en U), **más sensores no siempre
  ayudan** (corrientes) y **hay problemas que piden memoria real** (rocas a la deriva).
- Siguientes pasos: redes recurrentes para las rocas móviles, *curriculum learning* (empezar fácil y
  subir la dificultad) y velocidad variable (acelerar y frenar).

---

## Chuleta para la demo

| Para enseñar… | Modelo | Mar | Qué mirar |
|---|---|---|---|
| Cómo aprende | 1 · Mar en calma | Mar en calma | Deslizador de «Sin entrenar» a «Mejor evaluación» |
| Recompensa escasa | 2 · Sin pistas | Mar en calma | Vaga o choca; comparar con el 1 en la Comparativa |
| Mínimo local | 1 · Mar en calma | Trampa en U | Se mete en la U |
| Solución con GPS | 6 · Trampa en U + GPS | Trampa en U | Rodea la U; torneo 5 vs 6 |
| Corriente | 3 · Corrientes | Corrientes | Cómo corrige el rumbo contra la deriva (flechas del agua) |
| Memoria | 7 vs 8 | Rocas a la deriva | Torneo: diferencia pequeña |

**Antes de empezar**: `pnpm demo:lan` (o `pnpm dev`), abrir la web, comprobar «Conectado», dejar el
modelo 1 cargado, velocidad Normal y rayos visibles.
