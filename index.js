import pkg from "@tago-io/sdk";
import { DigestClient } from "digest-fetch";
import fs from "fs";

const { Utils, Analysis, Device } = pkg;

// Credenciales de autenticación
const username = "admin";
const password = "Inteliksa6969";

// URL base del dispositivo Hikvision
const host = "http://34.221.158.219";
const devIndexAcceso = "F5487AA0-2485-4CFB-9304-835DCF118B43";

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
async function index(context) {
  const env = Utils.envToJson(context.environment);
  const device = new Device({ token: env.device_token });

  const client = new DigestClient(username, password);

  // Leer el archivo JSON
  const usuarios = JSON.parse(fs.readFileSync("./usuarios_sap.json", "utf8"));

  // Obtener los usuarios de Hikvision
  const hikvisionUsers = await getHikvisionUsers(client);

  // Crear un conjunto de employeeNo de los usuarios de Hikvision
  const hikvisionEmployeeNos = new Set(hikvisionUsers.map((user) => user.employeeNo.toString()));

  // Crear un conjunto de employeeNo de los usuarios de SAP
  const sapEmployeeNos = new Set(usuarios.map((usuario) => usuario.employeeNo.toString()));

  // Identificar usuarios nuevos (que están en SAP pero no en Hikvision)
  const nuevosUsuarios = usuarios.filter((usuario) => !hikvisionEmployeeNos.has(usuario.employeeNo.toString()));

  // Agregar nuevos usuarios si es necesario
  if (nuevosUsuarios.length > 0) {
    console.log("Usuarios nuevos encontrados. Agregando...");
    for (const usuario of nuevosUsuarios) {
      const result = await addHikvisionUser(client, usuario);
      if (result) {
        console.log(`Usuario ${usuario.employeeNo} (${usuario.name}) agregado.`);
      }
    }
  } else {
    console.log("No hay nuevos usuarios para agregar.");
  }

  // Comparar y actualizar usuarios existentes
  const usuariosParaActualizar = usuarios.filter((usuario) => {
    const hikvisionUser = hikvisionUsers.find((user) => user.employeeNo.toString() === usuario.employeeNo.toString());
    return (
      hikvisionUser &&
      (hikvisionUser.name !== usuario.name || hikvisionUser.Valid.enable !== usuario.valid.enable)
    );
  });

  // Si hay usuarios para actualizar, realizar la actualización
  if (usuariosParaActualizar.length > 0) {
    console.log("Usuarios para actualizar encontrados. Actualizando...");
    for (const usuario of usuariosParaActualizar) {
      const result = await updateHikvisionUser(client, usuario);
      if (result) {
        console.log(`Usuario ${usuario.employeeNo} (${usuario.name}) actualizado.`);
      }
    }
  } else {
    console.log("No hay usuarios para actualizar.");
  }

  // Identificar usuarios eliminados (que están en Hikvision pero no en SAP)
  const usuariosParaEliminar = hikvisionUsers.filter((user) => !sapEmployeeNos.has(user.employeeNo.toString()));

  // Eliminar usuarios si es necesario
  if (usuariosParaEliminar.length > 0) {
    console.log("Usuarios eliminados encontrados. Eliminando...");
    for (const user of usuariosParaEliminar) {
      const result = await deleteHikvisionUser(client, user.employeeNo);
      if (result) {
        console.log(`Usuario ${user.employeeNo} eliminado.`);
      }
    }
  } else {
    console.log("No hay usuarios para eliminar.");
  }

  console.log("Proceso completado.");
}

export default new Analysis(index, {
  token: "a-6d6726c2-f167-4610-a9e5-5a08a92b6bb3",
});