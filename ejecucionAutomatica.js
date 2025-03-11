import { DigestClient } from "digest-fetch";
import fs from "fs";
import 'dotenv/config';
import express from "express";
import axios from "axios";

const app = express();
const PORT = process.env.PORT || 4000;

app.get('/', (req, res) => {
  res.send('Servidor corriendo correctamente');
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});

// Credenciales
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
      headers: { 'Authorization': SAP_AUTH }
    });

    if (response.data?.correcto && Array.isArray(response.data.contenido)) {
      return response.data.contenido.map(user => ({
        employeeNo: user.employeeNo,
        name: user.name,
        pin: user.pin,
        valid: user.valid.enable,
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
    return data.UserInfoSearch?.UserInfo || [];
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
          enable: usuario.valid,
          beginTime: "2023-09-26T00:00:00",
          endTime: "2037-12-31T23:59:59",
          timeType: "local",
        },
        doorRight: "1",
        RightPlan: [{ doorNo: 1, planTemplateNo: "1" }],
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
      Valid: { enable: usuario.valid },
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

// Función principal para sincronizar usuarios
async function syncUsers() {
  console.log("🔄 Iniciando sincronización de usuarios...");
  const client = new DigestClient(username, password);
  const sapUsers = await getSAPUsers();
  const hikvisionUsers = await getHikvisionUsers(client);

  const hikvisionEmployeeNos = new Set(hikvisionUsers.map(user => user.employeeNo.toString()));
  const sapEmployeeNos = new Set(sapUsers.map(usuario => usuario.employeeNo.toString()));

  // Usuarios nuevos en SAP que deben agregarse a Hikvision
  const nuevosUsuarios = sapUsers.filter(usuario => !hikvisionEmployeeNos.has(usuario.employeeNo.toString()));
  console.log(`🟢 Usuarios CREADOS (${nuevosUsuarios.length}):`);
  for (const usuario of nuevosUsuarios) {
    console.log(`   ➕ ${usuario.employeeNo} - ${usuario.name}`);
    await addHikvisionUser(client, usuario);
  }

  // Usuarios que necesitan actualización en Hikvision
  const usuariosParaActualizar = sapUsers.filter(usuario => {
    const hikvisionUser = hikvisionUsers.find(user => user.employeeNo.toString() === usuario.employeeNo.toString());
    return hikvisionUser && (hikvisionUser.name !== usuario.name || hikvisionUser.Valid.enable !== usuario.valid);
  });
  console.log(`🟡 Usuarios ACTUALIZADOS (${usuariosParaActualizar.length}):`);
  for (const usuario of usuariosParaActualizar) {
    console.log(`   🔄 ${usuario.employeeNo} - ${usuario.name}`);
    await updateHikvisionUser(client, usuario);
  }

  // Usuarios que ya no existen en SAP y deben ser eliminados de Hikvision
  const usuariosParaEliminar = hikvisionUsers.filter(user => !sapEmployeeNos.has(user.employeeNo.toString()));
  console.log(`🔴 Usuarios ELIMINADOS (${usuariosParaEliminar.length}):`);
  for (const user of usuariosParaEliminar) {
    console.log(`   ❌ ${user.employeeNo} - ${user.name}`);
    await deleteHikvisionUser(client, user.employeeNo);
  }

  console.log("✅ Proceso de sincronización completado.");
}

// Ejecutar la sincronización al iniciar el script
syncUsers().catch(error => console.error("❌ Error en la sincronización:", error));

// Ejecutar la sincronización cada 5 segundos
setInterval(() => {
  syncUsers().catch(error => console.error("❌ Error en la sincronización:", error));
}, 14000);


