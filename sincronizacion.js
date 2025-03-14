import pkg from "@tago-io/sdk";
import { DigestClient } from "digest-fetch";
import fs from "fs";
import 'dotenv/config';
import express from "express";
import axios from "axios";

const { Utils, Analysis, Device } = pkg;

const app = express();

// Usa el puerto proporcionado por Render o el 3000 por defecto
const PORT = process.env.PORT || 4000;

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
const devIndex_1001 = process.env.HIKVISION_DEV_INDEX_1001;
const devIndex_1002 = process.env.HIKVISION_DEV_INDEX_1002;

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
  const url = `${host}/ISAPI/AccessControl/UserInfo/Search?format=json&devIndex=${devIndex_1001}`;
  const options = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      UserInfoSearchCond: { searchID: "0", searchResultPosition: 0, maxResults: 30 }
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

// Función para ejecutar acciones en ambos dispositivos
async function executeOnDevices(client, action, usuarioOrEmployeeNo) {
  const devIndexes = [devIndex_1001, devIndex_1002];
  const requests = devIndexes.map(devIndex => action(client, usuarioOrEmployeeNo, devIndex));
  return Promise.all(requests);
}

// Agregar usuario a Hikvision
async function addHikvisionUser(client, usuario, devIndex) {
  const url = `${host}/ISAPI/AccessControl/UserInfo/Record?format=json&devIndex=${devIndex}`;
  const body = {
    UserInfo: [{
      employeeNo: usuario.employeeNo,
      name: usuario.name,
      userType: "normal",
      gender: "male",
      localUIRight: false,
      Valid: { enable: usuario.valid, beginTime: "2023-09-26T00:00:00", endTime: "2037-12-31T23:59:59", timeType: "local" },
      doorRight: "1",
      RightPlan: [{ doorNo: 1, planTemplateNo: "1" }],
      userVerifyMode: "",
      password: usuario.pin,
    }],
  };

  try {
    const response = await client.fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return response.json();
  } catch (error) {
    console.error(`Error al agregar usuario ${usuario.employeeNo} en ${devIndex}:`, error);
    return null;
  }
}

// Actualizar usuario en Hikvision
async function updateHikvisionUser(client, usuario, devIndex) {
  const url = `${host}/ISAPI/AccessControl/UserInfo/Modify?format=json&devIndex=${devIndex}`;
  const body = {
    UserInfo: {
      employeeNo: usuario.employeeNo,
      name: usuario.name,
      Valid: { enable: usuario.valid },
      password: usuario.pin,
    },
  };

  try {
    const response = await client.fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return response.json();
  } catch (error) {
    console.error(`Error al actualizar usuario ${usuario.employeeNo} en ${devIndex}:`, error);
    return null;
  }
}

// Eliminar usuario en Hikvision
async function deleteHikvisionUser(client, employeeNo, devIndex) {
  const url = `${host}/ISAPI/AccessControl/UserInfoDetail/Delete?format=json&devIndex=${devIndex}`;
  const body = { UserInfoDetail: { mode: "byEmployeeNo", EmployeeNoList: [{ employeeNo }] } };

  try {
    const response = await client.fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return response.json();
  } catch (error) {
    console.error(`Error al eliminar usuario ${employeeNo} en ${devIndex}:`, error);
    return null;
  }
}

// Sincronizar usuarios
async function syncUsers() {
  const client = new DigestClient(username, password);
  const sapUsers = await getSAPUsers();
  const hikvisionUsers = await getHikvisionUsers(client);

  const hikvisionEmployeeNos = new Set(hikvisionUsers.map(user => user.employeeNo.toString()));
  const sapEmployeeNos = new Set(sapUsers.map(usuario => usuario.employeeNo.toString()));

  // Agregar nuevos usuarios
  const nuevosUsuarios = sapUsers.filter(usuario => !hikvisionEmployeeNos.has(usuario.employeeNo.toString()));
  console.log(`🟢 Usuarios CREADOS (${nuevosUsuarios.length}):`);
  nuevosUsuarios.forEach(usuario => console.log(`   ➕ ${usuario.employeeNo} - ${usuario.name}`));
  for (const usuario of nuevosUsuarios) {
    await executeOnDevices(client, addHikvisionUser, usuario);
  }

  // Actualizar usuarios existentes
  const usuariosParaActualizar = sapUsers.filter(usuario => {
    const hikvisionUser = hikvisionUsers.find(user => user.employeeNo.toString() === usuario.employeeNo.toString());
    return hikvisionUser && (hikvisionUser.name !== usuario.name || hikvisionUser.Valid.enable !== usuario.valid);
  });
  console.log(`🟡 Usuarios ACTUALIZADOS (${usuariosParaActualizar.length}):`);
  usuariosParaActualizar.forEach(usuario => console.log(`   ✏️ ${usuario.employeeNo} - ${usuario.name}`));

  for (const usuario of usuariosParaActualizar) {
    await executeOnDevices(client, updateHikvisionUser, usuario);
  }

  // Eliminar usuarios que ya no existen en SAP
  const usuariosParaEliminar = hikvisionUsers.filter(user => !sapEmployeeNos.has(user.employeeNo.toString()));
  console.log(`🔴 Usuarios ELIMINADOS (${usuariosParaEliminar.length}):`);
  usuariosParaEliminar.forEach(user => console.log(`   ❌ ${user.employeeNo} - ${user.name}`));

  for (const user of usuariosParaEliminar) {
    await executeOnDevices(client, deleteHikvisionUser, user.employeeNo);
  }

  console.log("✅ Sincronización completada.");
}

export default new Analysis(syncUsers, { token: process.env.ANALYSIS_TOKEN });
