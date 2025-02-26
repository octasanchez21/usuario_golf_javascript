import pkg from "@tago-io/sdk";
import { DigestClient } from "digest-fetch";
import fs from "fs";
import 'dotenv/config';
import express from "express";
import axios from "axios";


const { Utils, Analysis, Device } = pkg;

const app = express();

// Usa el puerto proporcionado por Render o el 3000 por defecto
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Servidor corriendo correctamente');
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});


// Credenciales de autenticación
const username = process.env.HIKVISION_USERNAME;
const password = process.env.HIKVISION_PASSWORD;
const host = process.env.HIKVISION_HOST;
const devIndexAcceso = process.env.HIKVISION_DEV_INDEX;

const SAP_URL = process.env.SAP_URL;
const SAP_AUTH = process.env.SAP_AUTH;


// Función para obtener los usuarios de SAP
async function getSAPUsers() {
  try {
    const response = await axios.get(SAP_URL, {
      headers: {
        'Authorization': SAP_AUTH
      }
    });

    if (response.data && response.data.correcto && Array.isArray(response.data.contenido)) {
      return response.data.contenido.map(user => ({
        employeeNo: user.employeeNo,
        name: user.name,
        pin: user.pin,
        valid: user.valid.enable === 'asset',
        belongGroup: user.valid.belongGroup,
        faceURL: user.faceURL
      }));
    } else {
      throw new Error('Respuesta inesperada de SAP');
    }
  } catch (error) {
    console.error('Error al obtener usuarios de SAP:', error.message);
    return [];
  }
}

// Función para obtener los usuarios de Hikvision
async function getHikvisionUsers(client) {
  const url = `${host}/ISAPI/AccessControl/UserInfo/Search?format=json&devIndex=${devIndexAcceso}`;
  const options = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      UserInfoSearchCond: {
        searchID: "0",
        searchResultPosition: 0,
        maxResults: 30,
      },
    }),
  };

  try {
    const response = await client.fetch(url, options);
    const data = await response.json();
    return data.UserInfoSearch.UserInfo || [];
  } catch (error) {
    console.error("Error al obtener usuarios de Hikvision:", error);
    return [];
  }
}

// Función para agregar un usuario a Hikvision
async function addHikvisionUser(client, usuario) {
  const url = `${host}/ISAPI/AccessControl/UserInfo/Record?format=json&devIndex=${devIndexAcceso}`;
  const body = {
    UserInfo: [
      {
        employeeNo: usuario.employeeNo,
        name: usuario.name,
        userType: "normal",
        gender: "male",
        localUIRight: false,
        Valid: {
          enable: usuario.valid.enable,
          beginTime: "2023-09-26T00:00:00",
          endTime: "2037-12-31T23:59:59",
          timeType: "local",
        },
        doorRight: "1",
        RightPlan: [
          {
            doorNo: 1,
            planTemplateNo: "1",
          },
        ],
        userVerifyMode: "",
        password: usuario.pin,
      },
    ],
  };

  const options = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };

  try {
    const response = await client.fetch(url, options);
    return response.json();
  } catch (error) {
    console.error(`Error al agregar usuario ${usuario.employeeNo}:`, error);
    return null;
  }
}

// Función para modificar un usuario en Hikvision
async function updateHikvisionUser(client, usuario) {
  const url = `${host}/ISAPI/AccessControl/UserInfo/Modify?format=json&devIndex=${devIndexAcceso}`;
  const body = {
    UserInfo: {
      employeeNo: usuario.employeeNo,
      name: usuario.name,
      Valid: {
        enable: usuario.valid.enable,
      },
      password: usuario.pin,
    },
  };

  const options = {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };

  try {
    const response = await client.fetch(url, options);
    return response.json();
  } catch (error) {
    console.error(`Error al actualizar usuario ${usuario.employeeNo}:`, error);
    return null;
  }
}

// Función para eliminar un usuario de Hikvision
async function deleteHikvisionUser(client, employeeNo) {
  const url = `${host}/ISAPI/AccessControl/UserInfoDetail/Delete?format=json&devIndex=${devIndexAcceso}`;
  const body = {
    UserInfoDetail: {
      mode: "byEmployeeNo",
      EmployeeNoList: [{ employeeNo }],
    },
  };

  const options = {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };

  try {
    const response = await client.fetch(url, options);
    return response.json();
  } catch (error) {
    console.error(`Error al eliminar usuario ${employeeNo}:`, error);
    return null;
  }
}

// Función principal del análisis
async function syncUsers() {
  const client = new DigestClient(username, password);
  const sapUsers = await getSAPUsers();
  const hikvisionUsers = await getHikvisionUsers(client);

  const hikvisionEmployeeNos = new Set(hikvisionUsers.map(user => user.employeeNo.toString()));
  const sapEmployeeNos = new Set(sapUsers.map(usuario => usuario.employeeNo.toString()));

  // Usuarios que se agregarán a Hikvision
  const nuevosUsuarios = sapUsers.filter(usuario => !hikvisionEmployeeNos.has(usuario.employeeNo.toString()));
  console.log(`🟢 Usuarios CREADOS (${nuevosUsuarios.length}):`);
  nuevosUsuarios.forEach(usuario => console.log(`   ➕ ${usuario.employeeNo} - ${usuario.name}`));
  for (const usuario of nuevosUsuarios) {
    await addHikvisionUser(client, usuario);
  }

  // Usuarios que necesitan actualización en Hikvision
  const usuariosParaActualizar = sapUsers.filter(usuario => {
    const hikvisionUser = hikvisionUsers.find(user => user.employeeNo.toString() === usuario.employeeNo.toString());
    return hikvisionUser && (hikvisionUser.name !== usuario.name || hikvisionUser.Valid.enable !== usuario.valid);
  });
  console.log(`🟡 Usuarios ACTUALIZADOS (${usuariosParaActualizar.length}):`);
  usuariosParaActualizar.forEach(usuario => console.log(`   🔄 ${usuario.employeeNo} - ${usuario.name}`));
  for (const usuario of usuariosParaActualizar) {
    await updateHikvisionUser(client, usuario);
  }

  // Usuarios que ya no existen en SAP y deben ser eliminados de Hikvision
  const usuariosParaEliminar = hikvisionUsers.filter(user => !sapEmployeeNos.has(user.employeeNo.toString()));
  console.log(`🔴 Usuarios ELIMINADOS (${usuariosParaEliminar.length}):`);
  usuariosParaEliminar.forEach(user => console.log(`   ❌ ${user.employeeNo} - ${user.name}`));
  for (const user of usuariosParaEliminar) {
    await deleteHikvisionUser(client, user.employeeNo);
  }

  console.log("✅ Proceso completado.");
}


export default new Analysis(syncUsers, {
  token: process.env.ANALYSIS_TOKEN,
});