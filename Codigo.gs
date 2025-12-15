/**
 * SISTEMA POS - HELADERÍA BREAK BACK
 * Desarrollado con Google Apps Script
 * Base de datos: Google Sheets
 */

const SPREADSHEET_ID = '1BNyeK6q1vtRnImFnYJbJ2eYjLBgmaV2mgBYhoRGA_rc';

// Nombres de las hojas
const SHEET_PRODUCTOS = 'Productos';
const SHEET_VENTAS = 'Ventas';
const SHEET_DETALLE_VENTAS = 'Detalle_Ventas';
const SHEET_CATEGORIAS = 'Categorias';

/**
 * Función principal para servir la aplicación web
 */
function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('POS Heladería Break Back')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Incluir archivos HTML/CSS/JS
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Obtener todos los productos
 */
function getProductos() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_PRODUCTOS);
    
    if (!sheet) {
      // Crear hoja si no existe
      crearHojaProductos(ss);
      return [];
    }
    
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return [];
    
    const productos = [];
    for (let i = 1; i < data.length; i++) {
      if (data[i][0]) {
        productos.push({
          id: data[i][0],
          nombre: data[i][1],
          sku: data[i][2],
          categoria: data[i][3],
          precio: parseFloat(data[i][4]) || 0,
          stock: parseInt(data[i][5]) || 0,
          imagen: data[i][6] || ''
        });
      }
    }
    return productos;
  } catch (e) {
    console.error('Error en getProductos:', e);
    return [];
  }
}

/**
 * Obtener categorías
 */
function getCategorias() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_CATEGORIAS);
    
    if (!sheet) {
      crearHojaCategorias(ss);
      return ['Helados', 'Bebidas', 'Postres', 'Toppings', 'Otros'];
    }
    
    const data = sheet.getDataRange().getValues();
    const categorias = [];
    for (let i = 1; i < data.length; i++) {
      if (data[i][0]) categorias.push(data[i][0]);
    }
    return categorias.length > 0 ? categorias : ['Helados', 'Bebidas', 'Postres', 'Toppings', 'Otros'];
  } catch (e) {
    return ['Helados', 'Bebidas', 'Postres', 'Toppings', 'Otros'];
  }
}

/**
 * Buscar producto por SKU (escáner)
 */
function buscarPorSKU(sku) {
  try {
    const productos = getProductos();
    return productos.find(p => p.sku === sku) || null;
  } catch (e) {
    console.error('Error en buscarPorSKU:', e);
    return null;
  }
}

/**
 * Buscar productos por término
 */
function buscarProductos(termino) {
  try {
    const productos = getProductos();
    const terminoLower = termino.toLowerCase();
    return productos.filter(p => 
      p.nombre.toLowerCase().includes(terminoLower) ||
      p.sku.toLowerCase().includes(terminoLower) ||
      p.categoria.toLowerCase().includes(terminoLower)
    );
  } catch (e) {
    console.error('Error en buscarProductos:', e);
    return [];
  }
}

/**
 * Obtener siguiente número de factura
 */
function getSiguienteNumeroFactura() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_VENTAS);
    
    if (!sheet) {
      crearHojaVentas(ss);
      return 'FAC-0001';
    }
    
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return 'FAC-0001';
    
    const lastFactura = sheet.getRange(lastRow, 1).getValue();
    if (!lastFactura) return 'FAC-0001';
    
    const numero = parseInt(lastFactura.replace('FAC-', '')) || 0;
    return 'FAC-' + String(numero + 1).padStart(4, '0');
  } catch (e) {
    console.error('Error en getSiguienteNumeroFactura:', e);
    return 'FAC-' + Date.now();
  }
}

/**
 * Guardar venta
 */
function guardarVenta(datosVenta) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    // Guardar en Ventas
    let sheetVentas = ss.getSheetByName(SHEET_VENTAS);
    if (!sheetVentas) {
      sheetVentas = crearHojaVentas(ss);
    }
    
    const numeroFactura = getSiguienteNumeroFactura();
    const fecha = new Date();
    
    sheetVentas.appendRow([
      numeroFactura,
      fecha,
      datosVenta.nombreCliente || 'Cliente General',
      datosVenta.subtotal,
      datosVenta.impuesto || 0,
      datosVenta.total,
      datosVenta.metodoPago,
      datosVenta.totalRecibido,
      datosVenta.devuelta,
      'COMPLETADA'
    ]);
    
    // Guardar detalle de venta
    let sheetDetalle = ss.getSheetByName(SHEET_DETALLE_VENTAS);
    if (!sheetDetalle) {
      sheetDetalle = crearHojaDetalleVentas(ss);
    }
    
    datosVenta.items.forEach(item => {
      sheetDetalle.appendRow([
        numeroFactura,
        fecha,
        item.id,
        item.nombre,
        item.sku,
        item.cantidad,
        item.precio,
        item.cantidad * item.precio
      ]);
      
      // Actualizar stock
      actualizarStock(ss, item.id, item.cantidad);
    });
    
    return {
      success: true,
      numeroFactura: numeroFactura,
      fecha: fecha.toLocaleString('es-CO'),
      message: '¡Venta guardada exitosamente!'
    };
  } catch (e) {
    console.error('Error en guardarVenta:', e);
    return {
      success: false,
      message: 'Error al guardar la venta: ' + e.message
    };
  }
}

/**
 * Actualizar stock de producto
 */
function actualizarStock(ss, productoId, cantidadVendida) {
  try {
    const sheet = ss.getSheetByName(SHEET_PRODUCTOS);
    if (!sheet) return;
    
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == productoId) {
        const stockActual = parseInt(data[i][5]) || 0;
        const nuevoStock = Math.max(0, stockActual - cantidadVendida);
        sheet.getRange(i + 1, 6).setValue(nuevoStock);
        break;
      }
    }
  } catch (e) {
    console.error('Error al actualizar stock:', e);
  }
}

/**
 * Obtener resumen de ventas del día
 */
function getResumenVentasHoy() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_VENTAS);
    
    if (!sheet) return { totalVentas: 0, cantidadVentas: 0, efectivo: 0, nequi: 0 };
    
    const data = sheet.getDataRange().getValues();
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    let totalVentas = 0;
    let cantidadVentas = 0;
    let efectivo = 0;
    let nequi = 0;
    
    for (let i = 1; i < data.length; i++) {
      const fechaVenta = new Date(data[i][1]);
      fechaVenta.setHours(0, 0, 0, 0);
      
      if (fechaVenta.getTime() === hoy.getTime()) {
        const total = parseFloat(data[i][5]) || 0;
        totalVentas += total;
        cantidadVentas++;
        
        if (data[i][6] === 'Efectivo') {
          efectivo += total;
        } else if (data[i][6] === 'Nequi') {
          nequi += total;
        }
      }
    }
    
    return {
      totalVentas: totalVentas,
      cantidadVentas: cantidadVentas,
      efectivo: efectivo,
      nequi: nequi
    };
  } catch (e) {
    console.error('Error en getResumenVentasHoy:', e);
    return { totalVentas: 0, cantidadVentas: 0, efectivo: 0, nequi: 0 };
  }
}

/**
 * Obtener historial de ventas
 */
function getHistorialVentas(limite) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_VENTAS);
    
    if (!sheet) return [];
    
    const data = sheet.getDataRange().getValues();
    const ventas = [];
    
    const inicio = Math.max(1, data.length - (limite || 50));
    
    for (let i = data.length - 1; i >= inicio; i--) {
      if (data[i][0]) {
        ventas.push({
          numeroFactura: data[i][0],
          fecha: new Date(data[i][1]).toLocaleString('es-CO'),
          cliente: data[i][2],
          total: parseFloat(data[i][5]) || 0,
          metodoPago: data[i][6],
          estado: data[i][9]
        });
      }
    }
    
    return ventas;
  } catch (e) {
    console.error('Error en getHistorialVentas:', e);
    return [];
  }
}

/**
 * Crear hoja de productos si no existe
 */
function crearHojaProductos(ss) {
  const sheet = ss.insertSheet(SHEET_PRODUCTOS);
  sheet.appendRow(['ID', 'Nombre', 'SKU', 'Categoría', 'Precio', 'Stock', 'Imagen']);
  
  // Datos de ejemplo
  const productosEjemplo = [
    [1, 'Helado de Vainilla', 'HEL001', 'Helados', 5000, 50, '🍨'],
    [2, 'Helado de Chocolate', 'HEL002', 'Helados', 5000, 45, '🍫'],
    [3, 'Helado de Fresa', 'HEL003', 'Helados', 5000, 40, '🍓'],
    [4, 'Sundae Especial', 'SUN001', 'Postres', 12000, 30, '🍨'],
    [5, 'Malteada Grande', 'MAL001', 'Bebidas', 8000, 25, '🥤'],
    [6, 'Banana Split', 'BAN001', 'Postres', 15000, 20, '🍌'],
    [7, 'Copa de Frutas', 'COP001', 'Postres', 10000, 35, '🍇'],
    [8, 'Helado de Maracuyá', 'HEL004', 'Helados', 5500, 30, '🥭'],
    [9, 'Cono Sencillo', 'CON001', 'Helados', 3500, 100, '🍦'],
    [10, 'Cono Doble', 'CON002', 'Helados', 6000, 80, '🍦'],
    [11, 'Granizado', 'GRA001', 'Bebidas', 4000, 60, '🧊'],
    [12, 'Topping Chispas', 'TOP001', 'Toppings', 1500, 100, '✨']
  ];
  
  productosEjemplo.forEach(p => sheet.appendRow(p));
  
  // Formato
  sheet.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#E91E63');
  sheet.setFrozenRows(1);
  
  return sheet;
}

/**
 * Crear hoja de ventas si no existe
 */
function crearHojaVentas(ss) {
  const sheet = ss.insertSheet(SHEET_VENTAS);
  sheet.appendRow(['NumeroFactura', 'Fecha', 'Cliente', 'Subtotal', 'Impuesto', 'Total', 'MetodoPago', 'TotalRecibido', 'Devuelta', 'Estado']);
  sheet.getRange(1, 1, 1, 10).setFontWeight('bold').setBackground('#E91E63');
  sheet.setFrozenRows(1);
  return sheet;
}

/**
 * Crear hoja de detalle de ventas si no existe
 */
function crearHojaDetalleVentas(ss) {
  const sheet = ss.insertSheet(SHEET_DETALLE_VENTAS);
  sheet.appendRow(['NumeroFactura', 'Fecha', 'ProductoID', 'Producto', 'SKU', 'Cantidad', 'PrecioUnitario', 'Subtotal']);
  sheet.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#E91E63');
  sheet.setFrozenRows(1);
  return sheet;
}

/**
 * Crear hoja de categorías si no existe
 */
function crearHojaCategorias(ss) {
  const sheet = ss.insertSheet(SHEET_CATEGORIAS);
  sheet.appendRow(['Categoría', 'Descripción', 'Icono']);
  
  const categorias = [
    ['Helados', 'Helados artesanales', '🍨'],
    ['Bebidas', 'Malteadas y granizados', '🥤'],
    ['Postres', 'Sundaes y especiales', '🍰'],
    ['Toppings', 'Adicionales', '✨'],
    ['Otros', 'Varios', '📦']
  ];
  
  categorias.forEach(c => sheet.appendRow(c));
  sheet.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#E91E63');
  sheet.setFrozenRows(1);
  
  return sheet;
}

/**
 * Inicializar todas las hojas
 */
function inicializarSistema() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    if (!ss.getSheetByName(SHEET_PRODUCTOS)) crearHojaProductos(ss);
    if (!ss.getSheetByName(SHEET_VENTAS)) crearHojaVentas(ss);
    if (!ss.getSheetByName(SHEET_DETALLE_VENTAS)) crearHojaDetalleVentas(ss);
    if (!ss.getSheetByName(SHEET_CATEGORIAS)) crearHojaCategorias(ss);
    
    return { success: true, message: 'Sistema inicializado correctamente' };
  } catch (e) {
    return { success: false, message: 'Error: ' + e.message };
  }
}

/**
 * Agregar nuevo producto
 */
function agregarProducto(producto) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName(SHEET_PRODUCTOS);
    
    if (!sheet) {
      sheet = crearHojaProductos(ss);
    }
    
    const lastRow = sheet.getLastRow();
    const lastId = lastRow > 1 ? parseInt(sheet.getRange(lastRow, 1).getValue()) || 0 : 0;
    const nuevoId = lastId + 1;
    
    sheet.appendRow([
      nuevoId,
      producto.nombre,
      producto.sku,
      producto.categoria,
      producto.precio,
      producto.stock,
      producto.imagen || '🍨'
    ]);
    
    return { success: true, id: nuevoId, message: 'Producto agregado exitosamente' };
  } catch (e) {
    return { success: false, message: 'Error: ' + e.message };
  }
}
