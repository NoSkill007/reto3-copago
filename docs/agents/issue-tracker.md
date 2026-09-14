# Issue tracker: GitHub

Los tickets y especificaciones viven en GitHub Issues.
Usa la CLI `gh`; determina el repositorio mediante `git remote -v`.

## Operaciones
- Crear: `gh issue create --title "..." --body-file <archivo>`
- Leer: `gh issue view <numero> --comments`
- Listar: `gh issue list --state open`
- Comentar: `gh issue comment <numero> --body-file <archivo>`
- Etiquetar: `gh issue edit <numero> --add-label "<etiqueta>"`
- Quitar etiqueta: `gh issue edit <numero> --remove-label "<etiqueta>"`
- Cerrar: `gh issue close <numero>`

Para cuerpos multilínea, escribe el contenido en un archivo y usa
`--body-file`.

“Publicar en el issue tracker” significa crear un issue.
“Consultar el ticket” significa leer el issue y sus comentarios.

## Pull requests as a triage surface
PRs as a request surface: no.
