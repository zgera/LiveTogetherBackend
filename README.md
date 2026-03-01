Backend de la aplicacion LiveTogether

LiveTogether se trata de una aplicacion de gestion de tareas hogareñas. Los usuarios tienen la posibilidad de agruparse en familias (Grupos de convivencia) en las que se crean tareas a completar, las cuales pueden ser aceptadas y completadas por los participantes a cambio de puntos que traen beneficios. El admin de esta puede verificar que las tareas hayan sido completadas verdaderamente, al igual que puede asignar tareas a miembros particulares. 

El sistema presenta una arquitectura limpia separada en 3 capas: Repositorios, servicios y rutas. 

Se utilizo el ORM Prisma, utilizando como base de datos SQLite.

En el sistema se puede encontrar la API de la aplicacion con sus correspondientes "Endpoints" al igual que un WebSocket, que fue integrado para mantener conexion bidireccional con los usuarios de forma que se le pueden comunicar cambios en tiempo real como la creacion de una nueva tarea en la familia, el asignado de una tarea, la revision de una tarea por parte del admin, entre otras cosas.

El sistema esta realizado bajo la utilizacion de la programacion orientada a objetos, utilizando sus conceptos y patrones de diseño, tales como el Strategy.
