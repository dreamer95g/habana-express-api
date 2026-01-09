// Importamos Express y Apollo Server
import express from "express";
import { ApolloServer } from "apollo-server-express";

// Importamos nuestro schema GraphQL y resolvers
import { typeDefs } from "./schema.js";
import { resolvers } from "./resolvers.js";

// Creamos la aplicación Express
const app = express();

// Función principal para iniciar el servidor
async function startServer() {
  // Inicializamos Apollo Server con nuestro schema y resolvers
  const server = new ApolloServer({
    typeDefs,   // Definición de tipos GraphQL
    resolvers, // Funciones que conectan GraphQL con Prisma
  });

  // Iniciamos Apollo Server
  await server.start();

  // Lo conectamos con Express
  server.applyMiddleware({ app });

  // Levantamos el servidor en el puerto definido en .env o 4000 por defecto
  app.listen({ port: process.env.PORT || 4000 }, () => {
    console.log(`🚀 Servidor listo en http://localhost:4000${server.graphqlPath}`);
  });
}

// Ejecutamos la función para arrancar el servidor
startServer();
