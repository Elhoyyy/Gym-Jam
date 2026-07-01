<div align="center">

# 🏋️ GymAndJam

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
- **Import / Export** de todos tus datos en un JSON (backup y portabilidad).
- **100% offline** — todo se guarda en tu navegador (`localStorage`).
- **Responsive** — diseñado para móvil y escritorio.

## 🚀 Cómo usarlo

**Opción A — Servidor local (recomendado):**

```bash
npm start
```

Luego abre <http://localhost:5173>. No instala nada (0 dependencias, solo Node.js).

**Opción B — Abrir el archivo directamente:**

Haz doble clic en `index.html`. Funciona sin servidor.

## 🧱 Estructura

```
GymAndJam/
├─ index.html         # Estructura y layout
├─ css/styles.css     # Sistema de diseño (tema oscuro)
├─ js/storage.js      # Capa de datos + biblioteca de ejercicios
├─ js/charts.js       # Gráficas SVG sin dependencias
├─ js/app.js          # Lógica, vistas e interacciones
└─ server.js          # Servidor estático mínimo (opcional)
```

## 🧮 Cómo se calculan las métricas

- **Volumen** = Σ (peso × repeticiones) de todas las series.
- **1RM estimado** (Epley): `peso × (1 + reps/30)`.
- **Racha**: días consecutivos con al menos un entreno registrado.

## 🗺️ Ideas de futuro (roadmap)

- [ ] Plantillas de rutina reutilizables
- [ ] Temporizador de descanso entre series
- [ ] Objetivos y seguimiento de peso corporal
- [ ] Sincronización opcional / PWA instalable
- [ ] Exportar informe en PDF

## 🤝 Contribuir

¡Las contribuciones son bienvenidas! Abre un issue o un pull request. Al ser código plano (HTML/CSS/JS vanilla) es muy fácil de leer y ampliar.

## 📄 Licencia

[MIT](LICENSE) — úsalo, modifícalo y compártelo libremente.

<div align="center">
<sub>Hecho con 💪 para quienes no fallan al gimnasio.</sub>
</div>
