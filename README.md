<div align="center">

# 🏋️ Gym&Jam

### Tu diario de entrenamiento — moderno, bonito y open source.

Registra **kilos y repeticiones**, organiza tus entrenos por **grupo muscular** y observa tu **progreso** con estadísticas y records personales. Sin cuentas, sin nube, sin dependencias. Tus datos son tuyos.

![status](https://img.shields.io/badge/estado-listo_para_usar-c8ff3d?style=flat-square)
![license](https://img.shields.io/badge/licencia-MIT-7c5cff?style=flat-square)
![deps](https://img.shields.io/badge/dependencias-0-2ee6a0?style=flat-square)

</div>

---

## ✨ Características

- **Organiza por tipo de entreno** — Pecho, Espalda, Hombro, Bíceps, Tríceps, Pierna, Glúteo, Abdomen y Cardio.
- **Registro rápido de series** — peso × repeticiones por cada serie, con volumen calculado al instante.
- **Biblioteca de +55 ejercicios** en español, y crea los tuyos propios.
- **Estadísticas potentes** con gráficas propias en SVG:
  - Volumen por sesión y volumen semanal.
  - Reparto de series por grupo muscular (donut).
  - **Progresión de fuerza** por ejercicio con **1RM estimado** (fórmula de Epley).
  - **Records personales** ordenados.
- **Detección de PR** — marca automáticamente cuando superas tu mejor marca.
- **Racha de entrenamiento** 🔥 para mantener la motivación.
- **Historial** completo, expandible, editable y eliminable.
- **Plantillas de rutina** — guarda tus rutinas (Push/Pull/Legs…) y reutilízalas en un toque.
- **Cuentas con login/registro** (opcional) y **base de datos local SQLite** para uso multidispositivo self-hosted.
- **Import / Export** de todos tus datos en un JSON (backup y portabilidad).
- **Responsive** — diseñado para móvil y escritorio.

## 🚀 Cómo usarlo

Requiere **Node.js ≥ 22.5** (usa el SQLite nativo `node:sqlite`). Sin dependencias externas.

**Opción A — Web con cuentas (self-hosted, recomendado):**

```bash
npm start
```

Abre <http://localhost:5173>, **regístrate** y tus datos se guardarán en una base de
datos local (`data/gymandjam.db`). Ideal para acceder desde varios dispositivos en tu red.

**Opción B — Local sin servidor:**

Haz doble clic en `index.html`. Funciona en modo local (sin cuenta), guardando en el
navegador (`localStorage`). Mismo app, sin backend.

## 🔐 Cuentas y datos

- **Contraseñas** cifradas con `scrypt` + salt (nunca en texto plano).
- **Sesiones** con tokens firmados (HMAC-SHA256); el secreto se guarda en `data/secret.key`.
- Cada usuario tiene su propio estado (entrenos, rutinas, ejercicios) en SQLite.
- El cliente sincroniza automáticamente y cachea en `localStorage` para funcionar offline.
- La carpeta `data/` está en `.gitignore`: **nunca se sube tu base de datos ni el secreto**.

> ⚠️ Pensado para **self-hosting** (tu máquina o red local). Si lo expones a Internet,
> ponlo detrás de **HTTPS** (por ejemplo con un reverse proxy como Caddy/Nginx).

## 🧱 Estructura

```
Gym&Jam/
├─ index.html         # Estructura y layout
├─ css/styles.css     # Sistema de diseño
├─ js/storage.js      # Capa de datos + biblioteca de ejercicios
├─ js/charts.js       # Gráficas SVG sin dependencias
├─ js/auth.js         # Login/registro + sincronización con el servidor
├─ js/app.js          # Lógica, vistas e interacciones
├─ server.js          # Servidor: estáticos + API + SQLite + auth
└─ data/              # Base de datos y secreto (generado, ignorado por git)
```

## 🧮 Cómo se calculan las métricas

- **Volumen** = Σ (peso × repeticiones) de todas las series.
- **1RM estimado** (Epley): `peso × (1 + reps/30)`.
- **Racha**: días consecutivos con al menos un entreno registrado.

## 🗺️ Ideas de futuro (roadmap)

- [x] Plantillas de rutina reutilizables
- [x] Cuentas con login/registro + base de datos local
- [x] Modo oscuro
- [x] Registro específico de cardio (tiempo y distancia)
- [x] Temporizador de descanso entre series
- [x] Imágenes por ejercicio (biblioteca open source)
- [x] PWA instalable + offline (service worker)
- [ ] Objetivos y seguimiento de peso corporal
- [ ] Exportar informe en PDF

## 🤝 Contribuir

¡Las contribuciones son bienvenidas! Abre un issue o un pull request. Al ser código plano (HTML/CSS/JS vanilla) es muy fácil de leer y ampliar.

## 🙏 Créditos

- Imágenes de ejercicios: [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (dominio público, *The Unlicense*). El mapa nombre→imagen está en `js/exercise-media.js` y es editable.

## 📄 Licencia

[MIT](LICENSE) — úsalo, modifícalo y compártelo libremente.

<div align="center">
<sub>Hecho con 💪 para quienes no fallan al gimnasio.</sub>
</div>
