L2Dwidget.init({
  model: {
    jsonPath:
      "https://cdn.jsdelivr.net/gh/evrstr/live2d-widget-models/live2d_evrstr/rem/model.json",
  },
  display: {
    position: "left", // Dirender dalam div #live2dCanvasWrapper
    width: 550, // Lebih besar dari w-96 (384px)
    height: 850,
    hOffset: 950,
    vOffset: -90,
  },
  mobile: {
    show: true,
    scale: 0.5,
  },
  react: {
    opacityDefault: 1,
    opacityOnHover: 0.2,
  },
});
