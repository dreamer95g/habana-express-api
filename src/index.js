import express from "express";
import { ApolloServer } from "apollo-server-express";
import { typeDefs } from "./schema.js";
import { resolvers } from "./resolvers.js";
import { getUserFromToken } from "./auth.js"; // <--- Importamos esto
import dotenv from 'dotenv';

dotenv.config();

const app = express();

async function startServer() {
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    // AQUÍ ESTÁ LA MAGIA: Contexto
    context: ({ req }) => {
      // Leemos el header "Authorization"
      const token = req.headers.authorization || '';
      // Desciframos el usuario
      const user = getUserFromToken(token);
      
      // Pasamos el usuario a todos los resolvers
      return { user };
    },
  });

  await server.start();
  server.applyMiddleware({ app });

  app.listen({ port: process.env.PORT || 4000 }, () => {
    console.log(`🚀 Servidor listo en http://localhost:4000${server.graphqlPath}`);
  });
}

startServer();