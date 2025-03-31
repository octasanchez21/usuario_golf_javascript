// Sincronizar usuarios
async function syncUsers(context) {
  const env = Utils.envToJson(context.environment);
  const device = new Device({ token: env.device_token });
  let errorCount = 0; // Contador de errores

  try {
    const client = new DigestClient(username, password);
    const sapUsers = await getSAPUsers();
    const hikvisionUsers = await getHikvisionUsers(client);

    const hikvisionEmployeeNos = new Set(hikvisionUsers.map(user => user.employeeNo.toString()));
    const sapEmployeeNos = new Set(sapUsers.map(usuario => usuario.employeeNo.toString()));

    // Agregar nuevos usuarios
    const nuevosUsuarios = sapUsers.filter(usuario => !hikvisionEmployeeNos.has(usuario.employeeNo.toString()));

    await device.sendData({ variable: "created_users", value: nuevosUsuarios.length });
    console.log(`🟢 Usuarios CREADOS (${nuevosUsuarios.length}):`);

    for (const usuario of nuevosUsuarios) {
      try {
        await executeOnDevices(client, addHikvisionUser, usuario);
      } catch (error) {
        console.error(`Error al agregar usuario ${usuario.employeeNo}:`, error);
        errorCount++;
      }
    }

    // Actualizar usuarios existentes
    const usuariosParaActualizar = sapUsers.filter(usuario => {
      const hikvisionUser = hikvisionUsers.find(user => user.employeeNo.toString() === usuario.employeeNo.toString());
      return hikvisionUser && (hikvisionUser.name !== usuario.name || hikvisionUser.Valid.enable !== usuario.valid);
    });

    await device.sendData({ variable: "updated_users", value: usuariosParaActualizar.length });
    console.log(`🟡 Usuarios ACTUALIZADOS (${usuariosParaActualizar.length}):`);

    for (const usuario of usuariosParaActualizar) {
      try {
        await executeOnDevices(client, updateHikvisionUser, usuario);
      } catch (error) {
        console.error(`Error al actualizar usuario ${usuario.employeeNo}:`, error);
        errorCount++;
      }
    }

    // Eliminar usuarios que ya no existen en SAP
    const usuariosParaEliminar = hikvisionUsers.filter(user => !sapEmployeeNos.has(user.employeeNo.toString()));

    await device.sendData({ variable: "deleted_users", value: usuariosParaEliminar.length });
    console.log(`🔴 Usuarios ELIMINADOS (${usuariosParaEliminar.length}):`);

    for (const user of usuariosParaEliminar) {
      try {
        await executeOnDevices(client, deleteHikvisionUser, user.employeeNo);
      } catch (error) {
        console.error(`Error al eliminar usuario ${user.employeeNo}:`, error);
        errorCount++;
      }
    }
  } catch (error) {
    console.error("Error en la sincronización general:", error);
    errorCount++;
  }

  // Enviar la cantidad de errores detectados
  await device.sendData({ variable: "errors", value: errorCount });
  console.log(`❗ Errores detectados: ${errorCount}`);
  console.log("✅ Sincronización completada.");
}

export default new Analysis(syncUsers, { token: process.env.ANALYSIS_TOKEN });
