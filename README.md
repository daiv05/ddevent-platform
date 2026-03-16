**Devent Platform**

**Devent** es una plataforma SaaS que permite a las empresas gestionar eventos de forma eficiente y escalable.

## Características

* **Event store**: Almacenamiento de eventos en tiempo real.
* **Workflow engine**: Motor de flujos de trabajo para automatizar procesos.
* **Webhook dispatching**: Envío de webhooks a servicios externos.
* **Analytics**: Analíticas en tiempo real para monitorizar eventos.
* **Scalability**: Arquitectura escalable para manejar grandes volúmenes de eventos.

## Arquitectura

La arquitectura se basa en un modelo de eventos, donde los eventos son el núcleo del sistema. Los eventos son capturados, procesados y almacenados en una base de datos optimizada para este propósito. Los flujos de trabajo se ejecutan en segundo plano, procesando los eventos y realizando acciones según las reglas definidas.

## Tecnologías

* **Next.js**: Framework para la interfaz de usuario.
* **PostgreSQL**: Base de datos para el almacenamiento de eventos.
* **Redis**: Cache para el almacenamiento de datos temporales.
* **TypeScript**: Lenguaje de programación.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```
