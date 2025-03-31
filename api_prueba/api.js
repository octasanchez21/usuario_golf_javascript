require('dotenv').config();
const express = require('express');

const app = express();
const PORT = 3000; // Puerto donde correrá la API

// Ruta principal para evitar "Cannot GET /"
app.get('/', (req, res) => {
    res.send('API funcionando correctamente. Usa /get-socios para obtener datos.');
});

// Datos que se enviarán como respuesta
const datosSocios = {
    "contenido": [
        {
            "employeeNo": "S01461",
            "faceURL": "http://sap-alb-1675436339.us-east-1.elb.amazonaws.com/FotosSocios?imageName=S01461.jpg",
            "name": "LUIS RIOS CORONITA",
            "pin": "",
            "valid": {
                "belongGroup": "accionista",
                "enable": true
            }
        },
        {
            "employeeNo": "S01488",
            "faceURL": "http://sap-alb-1675436339.us-east-1.elb.amazonaws.com/FotosSocios?imageName=S01488.jpg",
            "name": "HERMANN VONDER MEDEN ARGUELLO",
            "pin": "",
            "valid": {
                "belongGroup": "accionista",
                "enable": true
            }
        },
        {
            "employeeNo": "S03477",
            "faceURL": "http://sap-alb-1675436339.us-east-1.elb.amazonaws.com/FotosSocios?imageName=S03477.jpg",
            "name": "JOSE REYES MSQUEIRA",
            "pin": "",
            "valid": {
                "belongGroup": "accionista",
                "enable": true
            }
        },
        {
            "employeeNo": "S99993",
            "name": "PRUEBA APP AF TITULAR",
            "pin": "",
            "valid": {
                "enable": true,
                "belongGroup": "accionista"
            },
            "faceURL": "https://t4.ftcdn.net/jpg/00/85/77/75/360_F_85777561_m6EMdjM6Knkz7OLJmN5zr5ZeK359S3G5.jpg"
        },
        {
            "employeeNo": "S00093",
            "name": "Lautaro Martinez",
            "pin": "",
            "valid": {
                "enable": true,
                "belongGroup": "accionista"
            },
            "faceURL": "https://t4.ftcdn.net/jpg/00/85/77/75/360_F_85777561_m6EMdjM6Knkz7OLJmN5zr5ZeK359S3G5.jpg"
        },
    ],
    "correcto": true,
    "critical": false,
    "mensaje": "",
    "detalles": "",
    "codigo": 200
};

// Ruta para obtener los socios de prueba
app.get('/get-socios', (req, res) => {
    res.json(datosSocios);
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
