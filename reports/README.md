# Informes de calidad de Orbit

`real-project-benchmark.json` registra resultados de cinco escenarios representativos: agencia, restaurante, catálogo comercial, portafolio y servicios profesionales.

Los escenarios no contienen datos de clientes. Se ejecutan 30 veces para medir la mediana y el percentil 95 del tiempo de importación y corrección. `npm run test:projects` falla si un documento reparado continúa inválido o si una operación supera el límite amplio de 750 ms.

Para actualizar el informe después de modificar el importador:

```bash
npm run report:projects
```
