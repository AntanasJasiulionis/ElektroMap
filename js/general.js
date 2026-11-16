"use strict";

const body = document.querySelector("body");
const sidebarContainer = document.querySelector(".sidebar");
const tabsConatiner = document.querySelector(".tab-container");
const tabs = document.querySelectorAll(".tab");
const tabsContent = document.querySelectorAll(".tab__content-container");

/////////////////////////////////////////////
// STATION ARCHITECTURE
class Station {
  #id = crypto.randomUUID();
  #marker;

  constructor(coords) {
    this.coords = coords;
  }

  get id() {
    return this.#id;
  }
  get marker() {
    return this.#marker;
  }

  // Marker
  setMarker() {
    const icon = L.icon({
      iconUrl: `./leaflet/dist/images/${this.type}-marker-icon.png`,
      iconRetinaUrl: `./leaflet/dist/images/${this.type}-marker-icon-2x.png`,
      shadowUrl: "./leaflet/dist/images/marker-shadow.png",
      iconSize: [25, 41],
      shadowSize: [41, 41],
      iconAnchor: [12, 41],
      shadowAnchor: [12, 41],
      popupAnchor: [1, -34],
    });

    this.#marker = L.marker(this.coords, {
      icon,
      riseOnHover: true,
      alt: `${this?.title || "Projekto"} žymeklis`,
    })
      .bindPopup(
        L.popup({
          maxWidth: 200,
          minWidth: 100,
          autoPan: false,
          className: `${this.type}-popup`,
        }),
      )
      .setPopupContent(this.#setPopupContentElement());

    return this;
  }
  removeMarker() {
    this.#marker = undefined;

    return this;
  }

  // Popup
  #setPopupContentElement() {
    let html = `
      <div>
        <span class="leaflet-popup--title">${this?.title || "Projektas"}</span>
    `;
    if (this.type === "station")
      html += `
        <div class="leaflet-popup-sum__container">
          <span class="leaflet-popup-sum--icon">
            <i class="ph ph-bank"></i>
          </span>
          <span class="leaflet-popup-sum--text">${this.balance}</span>
          <span class="leaflet-popup-sum--unit">€</span>
        </div>
    `;
    html += `</div>`;

    return html;
  }
  updatePopupContent() {
    this.#marker.setLatLng(this.coords);
    this.#marker._popup.setContent(this.#setPopupContentElement());

    return this;
  }
}

class Project extends Station {
  type = "project";

  constructor(coords, radius) {
    super(coords);
    this.radius = radius;
  }
}

class Power extends Station {
  type = "station";
  #distance = { km: undefined, m: undefined };

  constructor(coords, title, balance) {
    super(coords);
    this.title = title;
    this.balance = balance;
  }

  get distance() {
    return this.#distance;
  }
  set distance({ km = undefined, m = undefined }) {
    this.#distance = { km, m };
    return this;
  }
}
/////////////////////////////////////////////
// APPLICATION ARCHITECTURE
class App {
  // Private instance properties
  #project = null;
  #stations = [];

  //Map attributes
  #map;
  #mapZoomLevel = 8;
  #tileLayer;

  //prettier-ignore
  #lithuaniaBounds = [[53.4475, 20.14],[56.8995, 27.65]];
  #minZoomLithuania = 7;
  //prettier-ignore
  #worldBounds = [[-85.05112878, -180],[85.05112878, 180]];
  #minZoomWorld = 3;

  constructor() {
    // Get Local Storage
    this.#getLocalStorage();

    // If project exists, show project values on form
    if (this.#project) {
      this._resetProjectInputs({ edit: true });
      this.#projectEditBtnShow();
    }

    // Render all station cards if stations exists
    if (this.#stations.length !== 0) this._renderAllStationCards();

    // Load the map
    this.#loadMap();

    // Render content at startup
    this.#renderProjectCards();

    // Set Global 'Submit' event for map
    sidebarContainer.addEventListener(
      "submit",
      this.#globalSubmitEvent.bind(this),
    );

    // Remove preloader when page fully loads
    window.addEventListener("load", this.#removePreloader.bind(this));
  }

  // Global Events
  #globalSubmitEvent(e) {
    e.preventDefault();

    // Create New Station when submitting form
    this.#createNewStation(e);

    // Create Project when submitting form
    this.#createProject(e);

    // Update Station when submitting form
    this.#updateStation(e);
  }

  // Forms submitting
  async #createNewStation(e) {
    const newStationForm = e.target.closest(".form__station--new");
    if (!newStationForm || newStationForm.classList.contains("hidden")) return;

    const formType = newStationForm.dataset.formType;
    const latitude = newStationForm.querySelector(
      ".form__input--latitude",
    ).value;
    const longitude = newStationForm.querySelector(
      ".form__input--longitude",
    ).value;
    const isLksToWgsCheckedManual = newStationForm.querySelector(
      ".form__station--new-container[data-form='manual'] .form__input--lksToWgs",
    ).checked;
    const isLksToWgsCheckedExcel = newStationForm.querySelector(
      ".form__station--new-container[data-form='excel'] .form__input--lksToWgs",
    ).checked;
    const title = newStationForm.querySelector(".form__input--title").value;
    const balance = newStationForm.querySelector(".form__input--balance").value;
    const file = newStationForm.querySelector(".input--file").files;
    let stations = [];

    if (formType === "manual") {
      // Add loader
      ui._addLoader();

      // Check if data is valid
      if (
        !this.#notEmptyInputs(latitude, longitude, title, balance) ||
        !this.#validNumberInputs(+latitude, +longitude, +balance) ||
        !this.#positiveInputs(+balance)
      )
        return ui._removeLoader({ instant: true });

      const coords = isLksToWgsCheckedManual
        ? lks94ToWgs84(+latitude, +longitude)
        : [(+latitude).toFixed(6), (+longitude).toFixed(6)];

      stations.push(new Power(coords, title, +balance));
    }
    if (formType === "excel") {
      const errorMessage = function (type, fileName, error) {
        ui._removeLoader({ instant: true });

        if (type === "noExcel")
          ui._showPopupWindow(
            `Nepavyko nuskaityti Excelio failo: <span>${fileName}</span>\n${error}`,
          );

        if (type === "noData")
          ui._showPopupWindow(
            `Excelio faile <span>${fileName}</span> nebuvo lapo pavadinimu „Elektrinės“`,
          );
        if (type === "emptyData")
          ui._showPopupWindow(
            `Excelio failas <span>${fileName}</span> yra tuščias`,
          );
      };

      // Add loader
      ui._addLoader();

      if (file.length === 0) return ui._removeLoader({ instant: true });

      const [data] = await readXlsxFile(file[0])
        .then((data) => data.filter((obj) => obj.sheet === "Elektrinės"))
        .catch((error) => errorMessage("noExcel", file[0].name, error));

      // If no Sheet "Elektrinės" throw error and return
      if (!data) return errorMessage("noData", file[0].name);

      // If excel data is completely empty throw error and return
      if (data.data.length <= 1) return errorMessage("emptyData", file[0].name);

      // Format data and push to temp stations []
      data.data.forEach(([lat, lon, t, sum], i) => {
        // Skip the first row
        if (i === 0) return;

        // Convert fields or assign if it's missing
        const latitude = +lat || (isLksToWgsCheckedExcel ? 493689 : 54.896804);
        const longitude =
          +lon || (isLksToWgsCheckedExcel ? 6084530 : 23.901616);

        const title = t || "Elektrinės pavadinimas";
        const balance = +sum || 0;

        const coords = isLksToWgsCheckedExcel
          ? lks94ToWgs84(latitude, longitude)
          : [latitude.toFixed(6), longitude.toFixed(6)];

        stations.push(new Power(coords, title, balance));
      });
    }
    if (formType === "excel") stations.reverse();

    stations.forEach((station) => {
      // Add new object to stations array
      this.#stations.push(station);

      // Calculate distance if project is assigned
      if (this.#project)
        station.distance = getDistance(this.#project.coords, station.coords);

      // Render marker, add to Map, set it's id
      station.setMarker();
      station.marker.addTo(this.#map);
      station.marker._icon.dataset.id = station.id;

      //Render stations on the list
      this.#renderStationCard(station);
    });

    // Save to local storage
    this.#setLocalStorage();

    // Close searchbox
    ui._closeSearchBox();

    // Remove Form
    ui._removeCreateStationForm();

    // Render project cards
    this.#renderProjectCards();

    // Remove loader
    ui._removeLoader({ instant: true });

    // Move view to the marker/markers
    if (formType === "manual") this._moveToMarker(stations[0].coords, 12);
    if (formType === "excel") this.#moveToAllMarkers();
  }
  #createProject(e) {
    const projectForm = e.target.closest(".project--form");
    if (!projectForm) return;

    const latitude = projectForm.querySelector(".form__input--latitude").value;
    const longitude = projectForm.querySelector(
      ".form__input--longitude",
    ).value;
    const isChecked = projectForm.querySelector(
      ".form__input--lksToWgs",
    ).checked;
    const radius = projectForm.querySelector(".form__input--radius").value;

    ui._addLoader();

    // Check if data is valid
    if (
      !this.#notEmptyInputs(latitude, longitude, radius) ||
      !this.#validNumberInputs(+latitude, +longitude, +radius) ||
      !this.#positiveInputs(+radius)
    )
      return ui._removeLoader({ instant: true });

    const coords = isChecked
      ? lks94ToWgs84(+latitude, +longitude)
      : [(+latitude).toFixed(6), (+longitude).toFixed(6)];

    // Create Project if it does not exist
    if (!this.#project) {
      this.#project = new Project(coords, +radius);
      this.#project.setMarker();
      this.#project.marker.addTo(this.#map);
      this.#project.marker._icon.dataset.id = this.#project.id;
    }
    // Update Project if it already exists
    if (this.#project) {
      this.#project.coords = coords;
      this.#project.radius = +radius;
      this.#project.updatePopupContent();
    }
    // Update station card distances if stations exists
    if (this.#stations.length !== 0)
      this.#stations.forEach((station) => {
        station.distance = getDistance(this.#project.coords, station.coords);
        this.#updateStationCard(station);
      });

    // Save to Local Storage
    this.#setLocalStorage();

    // Render Project Cards content
    this.#renderProjectCards();

    // Remove loader
    ui._removeLoader({ instant: true });

    // Add disabled buttons and change to edit button
    this.#projectEditBtnShow();

    // Move to project marker
    this._moveToMarker(this.#project.coords, 12);
  }
  #updateStation(e) {
    const stationForm = e.target.closest(".station--form");
    if (!stationForm) return;

    const station = this._searchStationById(
      e.target.closest(".station")?.dataset.id,
    );
    if (!station) return;

    const latitude = stationForm.querySelector(".form__input--latitude").value;
    const longitude = stationForm.querySelector(
      ".form__input--longitude",
    ).value;
    const isLksToWgsChecked = stationForm.querySelector(
      ".form__input--lksToWgs",
    ).checked;
    const title = stationForm.querySelector(".form__input--title").value;
    const balance = stationForm.querySelector(".form__input--balance").value;

    // Add loader
    ui._addLoader();

    // Check if data is valid
    if (
      !this.#notEmptyInputs(latitude, longitude, title, balance) ||
      !this.#validNumberInputs(+latitude, +longitude, +balance) ||
      !this.#positiveInputs(+balance)
    )
      return ui._removeLoader({ instant: true });

    const coords = isLksToWgsChecked
      ? lks94ToWgs84(+latitude, +longitude)
      : [(+latitude).toFixed(6), (+longitude).toFixed(6)];

    // Update Station Card
    station.coords = coords;
    station.title = title;
    station.balance = +balance;
    if (this.#project) {
      station.distance = getDistance(this.#project.coords, station.coords);
      this.#renderProjectCards();
    }
    station.updatePopupContent();
    this.#updateStationCard(station);

    // Close Form
    ui._removeStationsForm();

    // Save to local storage
    this.#setLocalStorage();

    // Remove loader
    ui._removeLoader({ instant: true });

    // Move view to marker
    this._moveToMarker(station.coords, 12);
    station.marker.openPopup();
  }

  // Map
  #loadMap() {
    const createTileView = function () {
      const map = document.getElementById("map");
      const html = `
        <figure figure class="map-tile__view hidden" data-map-tile-view="1">
          <p class="map-tile__view--text">Palydovas</p>
        </figure>
      `;

      map.insertAdjacentHTML("afterbegin", html);

      const tileView = document.querySelector(".map-tile__view");
      setTimeout(() => tileView.classList.remove("hidden"), 10);
    };

    this.#map = L.map("map", {
      attributionControl: false,
      minZoom: this.#minZoomLithuania,
      maxBounds: this.#lithuaniaBounds,
      maxBoundsViscosity: 1,
    }).setView([54.896804, 23.901616], this.#mapZoomLevel);

    this.#tileLayer = L.tileLayer(
      "http://{s}.google.com/vt?lyrs=m&x={x}&y={y}&z={z}",
      {
        noWrap: true,
        maxZoom: 20,
        subdomains: ["mt0", "mt1", "mt2", "mt3"],
      },
    );

    // Add Tile layer to the map
    this.#tileLayer.addTo(this.#map);

    // Add map Tile View
    createTileView();

    // Render markers
    const options = { maxZoom: this.#mapZoomLevel, animate: false };

    if (this.#project) {
      this.#project.marker.addTo(this.#map);
      this.#project.marker._icon.dataset.id = this.#project.id;
    }
    if (this.#project && this.#stations.length === 0)
      this.#map.fitBounds([this.#project.coords], options);

    if (this.#stations.length !== 0) {
      this.#stations.forEach((station) => {
        station.marker.addTo(this.#map);
        station.marker._icon.dataset.id = station.id;
      });

      // Fit all markers on the map
      this.#map.fitBounds(
        this.#stations.map((station) => station.coords),
        options,
      );
    }
  }
  _closePopup() {
    if (!this.#map) return this;
    this.#map.closePopup();

    return this;
  }

  // Project Cards
  #renderProjectCards() {
    const projectText = document.querySelector(
      ".project--content .project--text",
    );
    const projectStationsContainer = document.querySelector(
      ".project--content .stations",
    );
    const projectStations = document.querySelectorAll(
      ".project--content .station",
    );
    const clearTabContent = () => {
      // Remove text if exists
      if (projectText) projectText.parentElement.removeChild(projectText);

      // Remove project cards if they exist
      if (projectStations.length !== 0) projectStationsContainer.innerHTML = "";

      // Remove polylines
      this.#map.eachLayer((layer) => {
        if (layer instanceof L.Polyline) this.#map.removeLayer(layer);
      });
    };
    const createProjectText = ({ isNearest = false, empty = false } = {}) => {
      const setHtml = () => {
        let html = `
        <div class="project--text${!isNearest && empty ? " empty" : ""}">
          <p>Elektrinės į kurias patenka projektas</p>
          <span class="station__value">${this.#project.radius}</span>
          <span class="station__unit">KM</span>
          <span>spinduliu
      `;
        if (!isNearest && empty) html += `, bei artimiausių elektrinių nerasta`;
        if (isNearest && !empty) html += ` nerasta`;
        html += `</span>`;
        if (isNearest && !empty)
          html += `<p>Žemiau pateiktos artimiausios elektrinės</p>`;
        html += `</div>`;

        return html;
      };
      projectStationsContainer.insertAdjacentHTML("beforebegin", setHtml());
    };
    clearTabContent();
    if (!this.#project || this.#stations.length === 0) return;
    ui._addLoader();

    // Allowance threshold in meters
    const allowance = 500;
    // Show nearest cards in span of 5km
    const upToDistance = 5000;
    // Show only nearest 5 cards
    const numberNearestCardsShow = 5;

    const stations = this.#stations.toSorted(
      (a, b) =>
        b.distance.km * 1000 +
        b.distance.m -
        (a.distance.km * 1000 + a.distance.m),
    );

    const stationsInsideProject = stations.filter(
      (station) =>
        station.distance.km * 1000 + station.distance.m <=
        this.#project.radius * 1000 + allowance,
    );

    // Render Cards inside radius
    if (stationsInsideProject.length !== 0) {
      createProjectText();
      stationsInsideProject.forEach((station) => {
        this.#renderStationCard(station, { onlyShow: true });
        this.#renderPolyline(station);
      });
    }

    // Render nearest Cards if they not inside radius
    if (stationsInsideProject.length === 0) {
      const nearestStations = stations.filter((station) => {
        const stationsBiggerThanRadius =
          this.#project.radius * 1000 <=
          station.distance.km * 1000 + station.distance.m;

        const stationsUpToKm =
          station.distance.km * 1000 + station.distance.m <=
          this.#project.radius * 1000 + allowance + upToDistance;

        return stationsBiggerThanRadius && stationsUpToKm;
      });

      if (nearestStations.length === 0)
        createProjectText({ isNearest: false, empty: true });

      if (nearestStations.length !== 0) {
        createProjectText({ isNearest: true });
        nearestStations.forEach((station, i) => {
          if (numberNearestCardsShow <= i) return;

          this.#renderStationCard(station, { onlyShow: true });
        });
      }
    }
    ui._removeLoader({ instant: true });
  }

  // Station Cards
  _deleteStationCard(id) {
    const stationEl = document.querySelector(
      `.station--content .station[data-id="${id}"]`,
    );
    if (!stationEl) return;

    const station = this._searchStationById(id);
    if (!station) return;

    // Delete Station Card
    stationEl.classList.add("hidden");
    setTimeout(() => {
      const stationEl = document.querySelector(
        `.station--content .station[data-id="${id}"]`,
      );
      if (!stationEl) return;
      stationEl.parentElement.removeChild(stationEl);
    }, 550);

    // Remove marker
    station.marker.remove(this.#map);
    station.removeMarker();

    // Remove from Stations
    const index = this.#stations.findIndex((station) => station.id === id);
    this.#stations.splice(index, 1);

    // Save to Local Storage
    this.#setLocalStorage();

    // Render Project Cards
    this.#renderProjectCards();
  }

  // Render cards
  #renderStationCard(station, { onlyShow = false } = {}) {
    const setHtml = () => {
      let html = `
        <li class="station" data-id="${station.id}">          
        `;
      if (!onlyShow) {
        const checkboxId = crypto.randomUUID();
        html += `
          <form class="form station--card station--form">
            <div class="form__row form__row--coords" data-description="Koordinatės">
              <input
                class="form__input form__input--latitude"
                type="text"
                name="latitude"
                placeholder="Platuma"
                autocomplete="off"
                inputmode="numeric"
              />
              <input
                class="form__input form__input--longitude"
                type="text"
                name="longitude"
                placeholder="Ilguma"
                autocomplete="off"
                inputmode="numeric"
              />
              <div class="form--checkbox">
                <label for="${checkboxId}">LKS-94</label>
                <input
                  id="${checkboxId}"
                  class="form__input--lksToWgs"
                  type="checkbox"
                  autocomplete="off"
                  checked
                />
              </div>
            </div>
            <div class="form__row form__row--title" data-description="Pavadinimas">
              <input
                class="form__input form__input--title"
                type="text"
                placeholder="Pavadinimas"
                spellcheck="false"
                name="station-title"
                autocomplete="off"
              />
            </div>
            <div class="station__details station__balance" data-description="Elektrinės suma">
              <span class="station__icon icon--balance">
                <i class="ph ph-bank"></i>
              </span>
              <span class="station__value">
                <input
                  class="form__input form__input--balance"
                  type="text"
                  name="balance"
                  placeholder="Suma"
                  autocomplete="off"
                  inputmode="numeric"
                />
              </span>
                <span class="station__unit">€</span>
            </div>
            <div class="station__details station__distance" data-description="Atstumas iki projekto vietos">
              <span class="station__icon icon--distance">
                <i class="ph ph-ruler"></i>
              </span>
              <span class="station__value distance--km">&mdash;</span>
              <span class="station__unit">KM</span>
              <span class="station__value distance--m">&mdash;</span>
              <span class="station__unit">M</span>
            </div>
            <div class="form__row form__row--submit">
              <button class="btn form__btn form__btn--done" data-description="Išsaugoti pakeitimus">
                <i class="ph-bold ph-check"></i>
              </button>
              <button class="btn form__btn form__btn--cancel" data-description="Atšaukti pakeitimus">
                <i class="ph-bold ph-x"></i>
              </button>
            </div>
      </form>
    `;
      }

      html += `
        <figure class="station--card station__card--active">
          <h2 class="station__title">${station.title}</h2>
          <div class="station__details station__balance" data-description="Elektrinės suma">
            <span class="station__icon icon--balance">
              <i class="ph ph-bank"></i>
            </span>
            <span class="station__value">${station.balance}</span>
            <span class="station__unit">€</span>
          </div>
          <div
            class="station__details station__distance"
            data-description="Atstumas iki projekto vietos">
            <span class="station__icon icon--distance">
              <i class="ph ph-ruler"></i>
            </span>
            <span class="station__value">${station.distance.km ?? "\u2014"}</span>
            <span class="station__unit">KM</span>
            <span class="station__value">${station.distance.m ?? "\u2014"}</span>
            <span class="station__unit">M</span>
          </div>
        </figure>
      </li>
    `;
      return html;
    };
    let parent;
    if (!onlyShow)
      parent = document.querySelector(".station--content .stations");
    if (onlyShow)
      parent = document.querySelector(".project--content .stations");

    parent.insertAdjacentHTML("afterbegin", setHtml());
  }
  _renderAllStationCards() {
    // Remove all station cards
    ui._removeAllStationCards();

    // Render all station cards
    this.#stations.forEach((station) => this.#renderStationCard(station));

    return this;
  }
  #updateStationCard(station) {
    const cards = document.querySelectorAll(
      `.station[data-id='${station.id}']`,
    );
    if (cards.length === 0) return;

    cards.forEach((card) => {
      const title = card.querySelector("figure .station__title");
      const balance = card.querySelector("figure .station__value");
      const [km, m] = card.querySelectorAll(
        "figure .station__distance .station__value",
      );

      // Update the content
      title.textContent = station.title;
      balance.textContent = station.balance || 0;
      km.textContent = station.distance.km ?? "\u2014";
      m.textContent = station.distance.m ?? "\u2014";
    });
  }
  #renderPolyline(station) {
    L.polyline([station.coords, this.#project.coords], {
      color: "#52bdf9",
      weight: 2,
      opacity: 0.5,
      interactive: false,
    }).addTo(this.#map);
  }

  // Marker
  _moveMarker(id) {
    const station = this._searchStationById(id);
    if (!station) return;

    const addDraggableState = function () {
      const setHtml = () => {
        const html = `
        <div class="drag-menu">
          <button class="btn drag__btn drag__btn--done" data-description="Patvirtinti poziciją">
            <i class="ph-bold ph-check"></i>
          </button>
          <button class="btn drag__btn drag__btn--cancel" data-description="Atšaukti pakeitimus">
            <i class="ph-bold ph-x"></i>
          </button>
        </div>
        `;
        return html;
      };
      const map = document.getElementById("map");
      const overlay = document.createElement("div");
      const overlayMap = document.createElement("div");
      overlay.classList.add("overlay");
      overlayMap.classList.add("overlay-map");

      body.prepend(overlay);
      map.prepend(overlayMap);
      map.insertAdjacentHTML("afterbegin", setHtml());

      setTimeout(() => body.classList.add("draggable--on"), 10);

      station.marker._icon.classList.add("draggable");
      station.marker.dragging.enable();
    };
    const removeDraggableState = function () {
      if (!body.classList.contains("draggable--on")) return;

      const overlay = document.querySelector(".overlay");
      const overlayMap = document.querySelector(".overlay-map");
      const dragMenu = document.querySelector(".drag-menu");

      body.classList.remove("draggable--on");
      setTimeout(() => {
        overlay.parentElement.removeChild(overlay);
        overlayMap.parentElement.removeChild(overlayMap);
        dragMenu.parentElement.removeChild(dragMenu);
      }, 250);

      station.marker._icon.classList.remove("draggable");
      station.marker.dragging.disable();
      station.updatePopupContent();
    };

    // Close all forms
    ui._removeCreateStationForm();
    ui._removeStationsForm();
    this._closePopup();

    if (body.classList.contains("draggable--on")) return;
    addDraggableState();
    const abortListeners = new AbortController();
    const option = { signal: abortListeners.signal };

    const btnDone = document.querySelector(".drag-menu .drag__btn--done");
    const btnCancel = document.querySelector(".drag-menu .drag__btn--cancel");

    // Close draggable state on btnCancel click  or escape
    btnCancel.addEventListener(
      "click",
      () => {
        abortListeners.abort();
        removeDraggableState();
      },
      option,
    );
    document.addEventListener(
      "keydown",
      (e) => {
        e.preventDefault();
        if (e.key === "Escape" && body.classList.contains("draggable--on")) {
          abortListeners.abort();
          removeDraggableState();
        }
      },
      option,
    );

    // Set new coords after click btnDone
    btnDone.addEventListener(
      "click",
      () => {
        const coords = Object.entries(station.marker.getLatLng()).map((value) =>
          value[1].toFixed(6),
        );
        abortListeners.abort();

        // If marker coordinates matches station coordinates return
        if (JSON.stringify(station.coords) === JSON.stringify(coords))
          return removeDraggableState();

        // Update station
        station.coords = coords;
        if (this.#project)
          station.distance = getDistance(this.#project.coords, station.coords);

        // Save to Local storage
        this.#setLocalStorage();

        this.#renderProjectCards();
        this._renderAllStationCards();
        removeDraggableState();
      },
      option,
    );
  }
  _searchStationById(id) {
    return this.#stations.find((station) => station.id === id);
  }
  _moveToMarker(coords, zoom = this.#mapZoomLevel) {
    this._closePopup();
    this.#map.setView(coords, zoom, {
      animate: true,
      pan: {
        duration: 1,
      },
    });
  }
  #moveToAllMarkers() {
    this._closePopup();
    this.#map.flyToBounds(
      this.#stations.map((station) => station.coords),
      {
        maxZoom: this.#mapZoomLevel + 1,
        animate: true,
        pan: {
          duration: 1,
        },
      },
    );
  }

  // Local Storage
  #setLocalStorage() {
    localStorage.setItem("project", JSON.stringify(this.#project));
    localStorage.setItem("stations", JSON.stringify(this.#stations));
  }
  #getLocalStorage() {
    const projectData = JSON.parse(localStorage.getItem("project"));
    const stationsData = JSON.parse(localStorage.getItem("stations"));

    if (projectData) {
      this.#project = new Project(projectData.coords, projectData.radius);
      this.#project.setMarker();
    }
    if (stationsData) {
      stationsData.forEach((station) => {
        const stationInstance = new Power(
          station.coords,
          station.title,
          station.balance,
        );
        if (this.#project)
          stationInstance.distance = getDistance(
            this.#project.coords,
            stationInstance.coords,
          );
        stationInstance.setMarker();
        this.#stations.push(stationInstance);
      });
    }
  }
  resetLocalStorage() {
    localStorage.removeItem("project");
    localStorage.removeItem("stations");
    location.reload();
  }

  // Utilities
  _changeTileLayer(e) {
    const tileView = e.target.closest(".map-tile__view");
    if (!tileView) return;

    const text = tileView.querySelector(".map-tile__view--text");
    const isSatellite = +tileView.dataset.mapTileView;

    // Change Tile layer on map
    this.#tileLayer.setUrl(
      isSatellite
        ? "http://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}"
        : "http://{s}.google.com/vt?lyrs=m&x={x}&y={y}&z={z}",
    );

    // Change tile view
    tileView.dataset.mapTileView = isSatellite ? 0 : 1;
    text.textContent = isSatellite ? "Žemėlapis" : "Palydovas";
    tileView.style.setProperty(
      "background-image",
      `url(${isSatellite ? "./public/images/street.jpg" : "./public/images/satelite.jpg"})`,
    );
    tileView.style.setProperty(
      "--color",
      `${isSatellite ? "#17242b" : "#e6f6fe"}`,
    );
  }
  _resetProjectInputs({ edit = false } = {}) {
    const allInputs = document.querySelectorAll(".project--form input");
    const btnSubmit = document.querySelector(".project--form .form__btn--done");
    const btnEdit = document.querySelector(".project--form .form__btn--edit");

    // Reset inputs
    allInputs.forEach((input) => {
      // Enable inputs
      input.disabled = false;

      // Reset input value and remove error messages
      if (input.type === "text") {
        ui._removeErrorMessage(input);
        input.value = "";
      }

      // Remove checked from checkbox
      if (!edit) {
        if (input.type === "checkbox") input.checked = false;
      }
      // Add default input only for radius
      if (!edit) {
        if (input.classList.contains("form__input--radius")) input.value = 15;
      }

      // Change set input values to project values if edit pressed
      if (edit && this.#project) {
        if (input.classList.contains("form__input--radius"))
          input.value = this.#project.radius;

        if (input.classList.contains("form__input--latitude")) {
          input.value = this.#project.coords[0];
          input.focus({ preventScroll: true });
        }

        if (input.classList.contains("form__input--longitude"))
          input.value = this.#project.coords[1];
      }
    });

    if (!edit) {
      // Add invalid class to text inputs
      allInputs.forEach((input) => {
        if (
          input.type === "text" &&
          !input.classList.contains("form__input--radius")
        )
          input.classList.add("invalid");
      });

      // Remove project
      if (this.#project) {
        this.#project.marker.remove(this.#map);
        this.#project.removeMarker();
        this.#project = null;

        // Delete all distances from cards if stations exists
        if (this.#stations.length !== 0)
          this.#stations.forEach((station) => {
            station.distance = "";
            this.#updateStationCard(station);
          });

        //Remove project cards
        this.#renderProjectCards();

        // Save to Local Storage
        this.#setLocalStorage();
      }
    }

    //Reset submit button to show
    btnSubmit.classList.remove("hidden");
    btnEdit.classList.add("hidden");
    if (!edit) btnSubmit.classList.add("form__btn--disable");
  }
  _filterCardsBySearchBox = debounce((e) => {
    const formatInput = function (input) {
      return (input + "")
        .split("")
        .map((word) => word.trim().toLowerCase())
        .join("")
        .replace(/[,.]/g, "");
    };
    const createSearchResultText = function () {
      const html = `
        <li>
          <span class="search__result--text">Paieškos rezultatų nėra</span>
        </li>
      `;
      const stationContainer = document.querySelector(
        ".station--content .stations",
      );
      stationContainer.insertAdjacentHTML("afterbegin", html);
    };

    const searchBox = e.target.closest(".form__search--stations input");
    if (!searchBox || searchBox.classList.contains("hidden")) return;
    if (this.#stations.length === 0) return;

    const input = formatInput(searchBox.value);

    if (searchBox.value.length > 0) {
      // Add loader to input
      searchBox.classList.add("loading");

      // Filter stations which includes this input
      const filteredStations = this.#stations.filter(
        (station) =>
          formatInput(station.title).includes(input) ||
          //Serach by coordinates
          // formatInput(station.coords).includes(input) ||
          formatInput(station.balance).includes(input),
      );

      // Remove all station cards
      ui._removeAllStationCards();

      if (filteredStations.length === 0) createSearchResultText();

      // Render filtered station cards
      filteredStations.forEach((station) => this.#renderStationCard(station));

      // Remove loader to input
      setTimeout(() => searchBox.classList.remove("loading"), 500);
    }
    if (searchBox.value.length === 0) this._renderAllStationCards();
  }, 500);
  #projectEditBtnShow() {
    const projectForm = document.querySelector(".project--form");
    if (!projectForm) return;

    const btnSubmit = projectForm.querySelector(".form__btn--done");
    const btnEdit = projectForm.querySelector(".form__btn--edit");

    projectForm
      .querySelectorAll("input")
      .forEach((input) => (input.disabled = true));
    btnSubmit.classList.add("form__btn--disable");
    btnSubmit.classList.add("hidden");
    btnEdit.classList.remove("hidden");

    return this;
  }

  // Check Inputs
  #notEmptyInputs(...inputs) {
    return inputs.every((input) => input.length > 0);
  }
  #validNumberInputs(...inputs) {
    return inputs.every((input) => Number.isFinite(input));
  }
  #positiveInputs(...inputs) {
    return inputs.every((input) => input >= 0);
  }
  #removePreloader() {
    const preloader = document.querySelector(".preloader");
    const overlay = document.querySelector(".preloader--overlay");

    preloader.classList.add("hidden");
    overlay.classList.add("hidden");
    setTimeout(() => {
      preloader.parentElement.removeChild(preloader);
      overlay.parentElement.removeChild(overlay);
    }, 350);

    return this;
  }
}

class UI {
  //Set private fields of instance
  #toolTipTimeOut;

  constructor() {
    // Set current year on Footer
    this.#setYearFooter();

    // Set Global 'Click' Evenet
    document.addEventListener("click", this.#globalClickEvent.bind(this));

    // Set Global 'Context Menu' Event
    document.addEventListener(
      "contextmenu",
      this.#globalContextEvent.bind(this),
    );

    // Set Global 'MouseOver' Event
    document.addEventListener(
      "mouseover",
      this.#globalMouseOverEvent.bind(this),
    );

    // Set Global 'MouseOut' Event
    document.addEventListener("mouseout", this.#globalMouseOutEvent.bind(this));

    // Set Global 'Input' Event
    sidebarContainer.addEventListener(
      "input",
      this.#globalInputEvent.bind(this),
    );

    // Set Global 'Change' input Event
    sidebarContainer.addEventListener(
      "change",
      this.#globalInputChangeEvenet.bind(this),
    );

    // Set Global 'Paste' input Event
    sidebarContainer.addEventListener(
      "paste",
      this.#globalPasteEvent.bind(this),
    );
  }

  #setYearFooter() {
    const footerEl = document.querySelector(".footer--year");
    footerEl.textContent = new Date().getFullYear();
    return this;
  }

  // Global Events
  #globalClickEvent(e) {
    // Change active tab when it's clicked on 'not' active tab
    this.#changeActiveTab(e);

    // Toggle SearchBar
    this.#searchBarToggle(e);

    // Add Form to create new station
    this.#renderCreateStationForm(e);

    // Remove Form that creates new station after clicking button
    this.#removeCreateStationForm(e);

    //Show selection menu in Create Station Form
    this.#showCreateStationFormSelectionMenu(e);

    // Change Form type in Create Station Form
    this.#changeFormTypeCreateStationForm(e);

    // Reset project inputs on cancel button
    this.#projectCancelEditBtnActions(e);

    // Change map tile when clicked
    app._changeTileLayer(e);

    // Move to marker on map by clicking on card
    this.#moveToMarkerByCard(e);

    // Context menu button actions
    this.#contextMenuButtons(e);

    // Remove context menu
    this.#closeContextMenu(e);

    // Remove station form
    this.#stationFormCancelBtnActions(e);

    // Open Main Menu
    this.#openMenu(e);
  }
  #globalMouseOverEvent(e) {
    // Show tooltip on mouseover for 1 second
    this.#showToolTip(e);

    // Hover marker on mouseover for card
    this.#onHoverCard(e);

    // Hover card on mouseover for marker
    this.#onHoverMarker(e);
  }
  #globalMouseOutEvent(e) {
    // Remove tooltip on mouse out
    this.#removeToolTip();

    // Remove hover marker on mouseout for card
    this.#onHoverOutCard(e);

    // Remove hover card on mouseout for marker
    this.#onHoverOutMarker(e);
  }
  #globalInputEvent(e) {
    // Display Error message on invalid inputs
    this.#errorMessage(e);

    //Allow only numbers in inputs
    this.#restrictInputToNumbers(e);

    // Render only that cards that are in the search box
    app._filterCardsBySearchBox(e);
  }
  #globalInputChangeEvenet(e) {
    // Check file format and show Error when format is wrong
    this.#checkFileFormatExcel(e);
  }
  #globalPasteEvent(e) {
    // Paste coordinates in 2 inputs, by spliting with , or ' '
    this.#pasteCoordsSplit(e);
  }
  #globalContextEvent(e) {
    // Open Context menu
    this.#openContextMenu(e);
  }

  //Click Events
  #changeActiveTab(e, { setManual = [false, 0] } = {}) {
    const goToTab = function (tabId) {
      //Remove active classes
      tabs.forEach((tab) => {
        tab.disabled = true;
        tab.classList.remove("tab--active");
        setTimeout(() => (tab.disabled = false), 0.4 * 1000);
      });

      //Activate menu tab
      document
        .querySelector(`.tab[data-tab="${tabId}"]`)
        .classList.add("tab--active");

      // Slide in to an active tab
      tabsContent.forEach((tab, i) => {
        tab.classList.add("scroll-bar__hidden");
        tab.style.transform = `translateX(${(i - tabId) * 100}%)`;
        setTimeout(
          () => tab.classList.remove("scroll-bar__hidden"),
          0.4 * 1000,
        );
      });
    };
    const [isSetManual, tabId] = setManual;
    const tab = isSetManual
      ? document.querySelector(`.tab-container .tab[data-tab="${tabId}"]`)
      : e.target.closest(".tab");

    if (!tab || tab.classList.contains("tab--active")) return;
    goToTab(tab.dataset.tab);

    this._closeSearchBox();
    this._removeCreateStationForm(0);
    this._removeStationsForm();
  }
  #searchBarToggle(e) {
    const openSearchBox = function () {
      // Remove search icon and add clear icon
      document
        .querySelectorAll(".btn--search .search__icon")
        .forEach((icon) => {
          icon.classList.remove("active");

          if (icon.classList.contains("icon--clear"))
            icon.classList.add("active");
        });

      // Remove hidden class from input
      const input = document.querySelector(
        ".form__search--stations .form__input",
      );
      input.classList.remove("hidden");
      setTimeout(() => input.focus({ preventScroll: true }), 250);
    };
    const btnSearch = e.target.closest(".btn--search");
    if (!btnSearch) return;
    const type = e.target.dataset.type;

    if (type === "search") openSearchBox();
    if (type === "clear") this._closeSearchBox();

    return this;
  }
  _closeSearchBox() {
    // Remove search icon and add search icon
    document.querySelectorAll(".btn--search .search__icon").forEach((icon) => {
      icon.classList.remove("active");

      if (icon.classList.contains("icon--search")) icon.classList.add("active");
    });

    // Add hidden class for input
    const input = document.querySelector(
      ".form__search--stations .form__input",
    );

    input.blur();
    input.classList.add("hidden");
    input.value = "";

    // Render all staion cards
    app._renderAllStationCards();

    return this;
  }
  #projectCancelEditBtnActions(e) {
    const projectCancelBtn = e.target.closest(
      ".project--form .form__btn--cancel",
    );
    const projectEditBtn = e.target.closest(".project--form .form__btn--edit");

    if (
      !projectCancelBtn &&
      (!projectEditBtn || projectEditBtn.classList.contains("hidden"))
    )
      return;
    e.preventDefault();

    if (projectCancelBtn) app._resetProjectInputs();
    if (projectEditBtn) app._resetProjectInputs({ edit: true });
  }
  #stationFormCancelBtnActions(e) {
    const stationFormCancelBtn = e.target.closest(
      ".station--form .form__btn--cancel",
    );
    if (!stationFormCancelBtn) return;
    e.preventDefault();

    this._removeStationsForm();
  }

  //ContextMenu
  #openContextMenu(e) {
    e.preventDefault();
    const openMenu = function ({
      marker = false,
      card = false,
      station = null,
      cardForm = false,
    } = {}) {
      const setHtml = () => {
        let html = `<article class="context--menu hidden" ${station ? `data-id="${station.id}"` : ""}>`;

        // Title
        if (marker || card)
          html += `
          <ul class="station__context">
            <li class="context__item title">
              <span>${station?.title || "Elektrinės pavadinimas"}</span>
            </li>
        `;
        // Copy Coordinates
        if ((card || marker) && !cardForm)
          html += `
            <li class="context__item copy">
              <div class="context__item-copy--container">
                <div class="context-copy-coords--container">
                  <span>${station?.coords[0] || "0"}</span>
                  <span>${station?.coords[1] || "0"}</span>
                </div>
                <div class="context-copy-icon--container">
                  <i class="context--icon ph-bold ph-clipboard-text"></i>
                  <span>Kopijuoti koordinates</span>
                </div>
              </div>
            </li>
        `;

        // Move station
        if (marker)
          html += `
          <li class="context__item move">
            <i class="context--icon ph ph-arrows-out-cardinal"></i>
            <span>Perstumti elektrinę</span>
          </li>
        `;

        // Edit Station
        if ((card || marker) && !cardForm)
          html += `
            <li class="context__item edit">
              <i class="context--icon ph-bold ph-arrows-clockwise"></i>
              <span>Redaguoti elektrinę</span>
            </li>
        `;

        // Delete Station
        if (marker || card)
          html += `
            <li class="context__item delete">
              <i class="context--icon ph-bold ph-trash"></i>
              <span>Pašalinti elektrinę</span>
            </li>
        `;

        if (marker || card)
          html += `
            </ul>
            <div class="context--divider"></div>`;

        html += `
            <ul class="main__context">
              <li class="context__item info">
                <i class="context--icon ph-bold ph-book-open-text"></i>
                <span>Žinynas</span>
              </li>
              <li class="context__item erase">
              <i class="context--icon ph-bold ph-eraser"></i>
              <span>Išvalyti visus duomenis</span>
              </li>
            </ul>
         </article>
        `;

        return html;
      };
      if (document.querySelector(".context--menu")) return;

      // Close popus
      app._closePopup();

      body.insertAdjacentHTML("afterbegin", setHtml());

      const contextMenu = document.querySelector(".context--menu");
      const margin = 5;

      // Set Top and Left position of menu
      contextMenu.style.top = `${e.y + contextMenu.offsetHeight > window.innerHeight ? window.innerHeight - contextMenu.offsetHeight - margin : e.y}px`;
      contextMenu.style.left = `${e.x + contextMenu.offsetWidth > window.innerWidth ? window.innerWidth - contextMenu.offsetWidth - margin : e.x + margin}px`;
      setTimeout(() => contextMenu.classList.remove("hidden"), 10);
    };

    const marker = e.target.closest(".leaflet-marker-icon");
    const card = e.target.closest(".station--content .station");
    const contextItem = e.target.closest(".context--menu .context__item");

    const isPopWindowOpen =
      body.classList.contains("modal--open") ||
      body.classList.contains("documentation--open") ||
      body.classList.contains("main-menu--open") ||
      body.classList.contains("draggable--on");

    if (marker && !marker.alt.includes("Projekto") && !isPopWindowOpen) {
      this.#closeContextMenu(e);
      openMenu({
        marker: true,
        cardForm: this.#isStationFormActive(
          document.querySelector(
            `.station--content .station[data-id="${marker.dataset.id}"]`,
          ),
        ),
        station: app._searchStationById(marker.dataset.id),
      });
      return;
    }

    if (card && !isPopWindowOpen) {
      this.#closeContextMenu(e);
      openMenu({
        card: true,
        cardForm: this.#isStationFormActive(card),
        station: app._searchStationById(card.dataset.id),
      });
      return;
    }

    if (!contextItem && !isPopWindowOpen) {
      this.#closeContextMenu(e);
      openMenu();
    }
    if (contextItem) {
      this.#contextMenuButtons(e);
      this.#closeContextMenu(e);
    }
  }
  #closeContextMenu(e) {
    const remove = () => {
      const contextMenu = document.querySelector(".context--menu");
      if (!contextMenu) return;
      contextMenu.parentElement.removeChild(contextMenu);
    };

    const contextMenu = e.target.closest(".context--menu");
    const contextItem = e.target.closest(
      ".context--menu .context__item:not(.title)",
    );
    if (contextMenu && !contextItem) return;

    remove();
  }
  #contextMenuButtons(e) {
    const contextItem = e.target.closest(".context__item");
    if (!contextItem) return;

    const id = document.querySelector(".context--menu").dataset.id;

    // Copy Coordinates to clipboard
    if (contextItem.classList.contains("copy") && id) {
      const station = app._searchStationById(id);
      if (!station) return;

      navigator.clipboard.writeText(station.coords.join(", "));
    }

    // Move Station
    if (contextItem.classList.contains("move") && id) app._moveMarker(id);

    // Edit Station
    if (contextItem.classList.contains("edit") && id)
      this.#openStationCardForm(id);

    // Delete Station
    if (contextItem.classList.contains("delete") && id) {
      const title = app._searchStationById(id)?.title || "Pavadinimu";
      this._showPopupWindow(
        `Elektrinė bus pašalinta <span>${title}</span><br/>Ar tikrai to norite?`,
        {
          onlyDisplay: false,
          object: app,
          cbFunction: app._deleteStationCard,
          args: [id],
        },
      );
    }

    // Documentation
    if (contextItem.classList.contains("info"))
      this._showPopupWindow(null, { type: "documentation" });

    // Erase all data
    if (contextItem.classList.contains("erase"))
      this._showPopupWindow(
        "Visi duomenys bus pašalinti<br/>Ar tikrai to norite?",
        { onlyDisplay: false, cbFunction: app.resetLocalStorage },
      );
  }

  //MainMenu
  #openMenu(e) {
    const menuBtn = e.target.closest(".btn.main-menu");
    if (!menuBtn) return;

    app._closePopup();
    this._showPopupWindow(null, { type: "menu" });
  }

  // MARKERS: MouseOver, MouseOut markers, cards
  #moveToMarkerByCard(e) {
    const stationEl = e.target.closest(".station");
    if (!stationEl) return;

    const station = app._searchStationById(stationEl.dataset.id);

    if (!station || this.#isSomeStationFormsActive()) return;

    app._moveToMarker(station.coords, 12);
    station.marker.openPopup();
  }
  #onHoverCard(e) {
    const card = e.target.closest(".station");
    if (!card) return;

    const marker = document.querySelector(
      `.leaflet-marker-pane .leaflet-marker-icon[data-id='${card.dataset.id}']`,
    );
    if (!marker) return;

    marker.classList.add("hovered");
  }
  #onHoverOutCard(e) {
    const card = e.target.closest(".station");
    if (!card) return;

    const marker = document.querySelector(
      `.leaflet-marker-pane .leaflet-marker-icon[data-id='${card.dataset.id}']`,
    );
    if (!marker) return;

    marker.classList.remove("hovered");
  }
  #onHoverMarker(e) {
    const marker = e.target.closest(".leaflet-marker-icon");
    if (!marker) return;

    const cards = document.querySelectorAll(
      `.station[data-id='${marker.dataset.id}']`,
    );
    if (cards.length === 0) return;

    cards.forEach((card) => card.classList.add("hovered"));
  }
  #onHoverOutMarker(e) {
    const marker = e.target.closest(".leaflet-marker-icon");
    if (!marker) return;

    const cards = document.querySelectorAll(
      `.station[data-id='${marker.dataset.id}']`,
    );
    if (cards.length === 0) return;

    cards.forEach((card) => card.classList.remove("hovered"));
  }

  // Station Cards
  #openStationCardForm(id) {
    const addShowForm = function (time) {
      setTimeout(() => {
        const stationCards = document.querySelectorAll(
          `.station--content .station[data-id="${id}"] .station--card`,
        );
        const stationCard = document.querySelector(
          `.station--content .station[data-id="${id}"]`,
        );
        const stationFormInputs = stationCard.querySelectorAll("input");
        const station = app._searchStationById(id);

        // Render form
        stationCards.forEach((card) => {
          card.classList.remove("station__card--active");
          if (!card.classList.contains("station--form")) return;

          card.classList.add("station__card--active");
        });

        // Set Form values
        stationFormInputs.forEach((input) => {
          if (input.type === "checkbox") return (input.checked = false);

          // Set Latitude
          if (input.classList.contains("form__input--latitude")) {
            input.value = station ? station.coords[0] : "0";
            setTimeout(() => input.focus({ preventScroll: true }), 250);
          }

          // Set Longitude
          if (input.classList.contains("form__input--longitude"))
            input.value = station ? station.coords[1] : "0";

          // Set Title
          if (input.classList.contains("form__input--title"))
            input.value = station ? station.title : "Elektrinės pavadinimas";

          // Set balance
          if (input.classList.contains("form__input--balance"))
            input.value = station ? station.balance : "0";
        });

        // Set distance
        if (station && station.distance.km >= 0 && station.distance.m >= 0) {
          const km = stationCard.querySelector(
            ".station__distance .distance--km",
          );
          const m = stationCard.querySelector(
            ".station__distance .distance--m",
          );

          km.textContent = station.distance.km;
          m.textContent = station.distance.m;
        }

        // Scroll active form into view
        setTimeout(
          () =>
            stationCard.scrollIntoView({
              behavior: "smooth",
              block: "center",
              container: "nearest",
            }),
          time / 3,
        );
      }, time);
    };

    const stationCard = document.querySelector(
      `.station--content .station[data-id="${id}"]`,
    );
    if (!stationCard) return;

    const isFormsOpen = this.#isSomeStationFormsActive();
    const formStationNew = document.querySelector(
      ".station--content .form__station--new",
    );

    // Close all forms and searchboxes, change to Stations tab
    this.#changeActiveTab(null, { setManual: [true, 1] });
    this._removeCreateStationForm();
    this._removeStationsForm();
    isFormsOpen || formStationNew
      ? setTimeout(() => this._closeSearchBox(), 500)
      : this._closeSearchBox();

    // Add show form
    isFormsOpen || formStationNew ? addShowForm(550) : addShowForm(10);
  }
  _removeStationsForm() {
    const allStations = document.querySelectorAll(
      ".station--content .stations .station--card",
    );

    allStations.forEach((station) => {
      //Remove active form class from all cards
      station.classList.remove("station__card--active");

      //Add active class to card
      if (!station.classList.contains("station--form"))
        station.classList.add("station__card--active");
    });
  }
  _removeAllStationCards({ animation = false } = {}) {
    const stationContainer = document.querySelector(
      ".station--content .stations",
    );

    const allStations = stationContainer.querySelectorAll(".station");

    if (animation) {
      allStations.forEach((station) => station.classList.add("hidden"));
    }

    animation
      ? setTimeout(() => (stationContainer.innerHTML = ""), 550)
      : (stationContainer.innerHTML = "");

    return this;
  }
  #isStationFormActive(station) {
    const form = station.querySelector(".station--form");
    if (!form) return false;

    return form.classList.contains("station__card--active");
  }
  #isSomeStationFormsActive() {
    const stations = document.querySelectorAll(
      ".station--content .station--card.station--form",
    );
    if (stations.length === 0) return false;

    return [...stations].some((card) =>
      card.classList.contains("station__card--active"),
    );
  }

  // Render create New Station Form
  #renderCreateStationForm(e) {
    const createForm = function () {
      const tab = document.querySelector(".form__search--stations");
      const html = `
            <form class="form form__station--new hidden" data-form-type="manual">
              <div
                class="form__row toggle__create--form"
                data-description="Sūkurimo būdas"
              >
                <figure class="form__selector">
                  <p class="" data-form="manual">Rankinis</p>
                  <p class="hidden" data-form="excel">Excel</p>
                  <div class="form__selection--container">
                    <p class="form__selection hidden" data-form="manual">
                      Rankinis
                    </p>
                    <p class="form__selection" data-form="excel">Excel</p>
                  </div>
                </figure>
              </div>
              <div class="form__station--new-container" data-form="manual">
                <div
                  class="form__row form__row--coords"
                  data-description="Koordinatės"
                >
                  <input
                    class="form__input form__input--latitude invalid"
                    type="text"
                    name="latitude"
                    placeholder="Platuma"
                    autocomplete="off"
                    inputmode="numeric"
                    value=""
                  />
                  <input
                    class="form__input form__input--longitude invalid"
                    type="text"
                    name="longitude"
                    placeholder="Ilguma"
                    autocomplete="off"
                    inputmode="numeric"
                    value=""
                  />
                  <div class="form--checkbox">
                    <label for="input--create__checkbox">LKS-94</label>
                    <input
                      id="input--create__checkbox"
                      class="form__input--lksToWgs"
                      type="checkbox"
                      autocomplete="off"
                      checked
                    />
                  </div>
                </div>
                <div
                  class="form__row form__row--title"
                  data-description="Pavadinimas"
                >
                  <input
                    class="form__input form__input--title invalid"
                    type="text"
                    placeholder="Pavadinimas"
                    spellcheck="false"
                    name="station-title"
                    autocomplete="off"
                    value=""
                  />
                </div>
                <div
                  class="station__details station__balance"
                  data-description="Elektrinės suma"
                >
                  <span class="station__icon icon--balance"
                    ><i class="ph ph-bank"></i
                  ></span>
                  <span class="station__value">
                    <input
                      class="form__input form__input--balance invalid"
                      type="text"
                      name="balance"
                      placeholder="Suma"
                      autocomplete="off"
                      inputmode="numeric"
                      value=""
                    />
                  </span>
                  <span class="station__unit">€</span>
                </div>
                <div
                  class="station__details station__distance"
                  data-description="Atstumas iki projekto vietos"
                >
                  <span class="station__icon icon--distance"
                    ><i class="ph ph-ruler"></i
                  ></span>
                  <span class="station__value distance--km">&mdash;</span>
                  <span class="station__unit">KM</span>
                  <span class="station__value distance--m">&mdash;</span>
                  <span class="station__unit">M</span>
                </div>
              </div>
              <div
                class="form__station--new-container hidden"
                data-form="excel"
              >
                <div
                  class="form__row excel__row"
                  data-description="Elektrinių kūrimas su excel failu"
                >
                  <label for="input-file">
                    <btn class="btn btn--choose__file">Pasirinkite failą</btn>
                  </label>
                  <p class="excel__row--text">Nepasirinktas failas</p>
                  <input
                    class="input--file hidden"
                    type="file"
                    id="input-file"
                    accept="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  />
                </div>
                <div class="form__row excel__row--checkbox">
                  <div class="form--checkbox">
                    <label for="input-file--checkbox">LKS-94</label>
                    <input
                      id="input-file--checkbox"
                      class="form__input--lksToWgs"
                      type="checkbox"
                      autocomplete="off"
                      checked
                    />
                  </div>
                </div>
              </div>

              <div class="form__row form__row--submit">
                <button
                  class="btn form__btn form__btn--done form__btn--disable"
                  data-description="Sukurti"
                >
                  <i class="ph-bold ph-check"></i>
                </button>
                <button
                  class="btn form__btn form__btn--cancel"
                  data-description="Anuliuoti"
                >
                  <i class="ph-bold ph-x"></i>
                </button>
              </div>
            </form>
    `;

      tab.insertAdjacentHTML("afterend", html);

      // Set focus on latitude input
      setTimeout(() => {
        const input = document.querySelector(
          ".form__station--new .form__input--latitude",
        );
        if (!input) return;
        input.focus({ preventScroll: true });
      }, 300);
    };
    const btnCreate = e.target.closest(".btn--new__station");
    if (!btnCreate) return;

    // Do not add new form if it already exists
    if (document.querySelector(".form__station--new")) return;

    // Close searchBox
    this._closeSearchBox();
    // Remove card forms
    this._removeStationsForm();

    // Create Form
    createForm();

    // Display Form
    const addNewForm = document.querySelector(".form__station--new");
    setTimeout(() => addNewForm.classList.remove("hidden"), 10);

    return this;
  }
  #removeCreateStationForm(e) {
    const cancelBtn = e.target.closest(
      ".form__station--new .form__btn--cancel",
    );
    if (!cancelBtn) return;
    e.preventDefault();

    this._removeCreateStationForm();

    return this;
  }
  _removeCreateStationForm(removeDelay = 550) {
    const addNewForm = document.querySelector(".form__station--new");
    if (!addNewForm) return;

    // Close searchbox
    ui._closeSearchBox();

    addNewForm.classList.add("hidden");
    setTimeout(() => {
      const addNewForm = document.querySelector(".form__station--new");
      if (addNewForm) addNewForm.parentElement.removeChild(addNewForm);
    }, removeDelay);
  }

  // Render Popup window
  _showPopupWindow(
    message,
    {
      type = "modal",
      onlyDisplay = true,
      cbFunction = () => {},
      args = [],
      object = null,
    } = {},
  ) {
    const map = document.getElementById("map");
    let className;
    if (type === "modal") className = "modal--open";
    if (type === "documentation") className = "documentation--open";
    if (type === "menu") className = "main-menu--open";

    const createPopupWindow = function () {
      const setHtml = () => {
        let html = "";
        if (type === "modal") {
          html += `
          <div class="modal">
            <button class="btn btn--close-modal">&times;</button>
            <p class="modal--text">${message}</p>
            <div class="modal--action-buttons">
        `;
          if (onlyDisplay)
            html += `<button class="btn btn--return-modal">Gerai</button>`;
          if (!onlyDisplay)
            html += `
            <button class="btn btn--action-modal">Taip</button>
            <button class="btn btn--return-modal">Ne</button>
            `;

          html += `</div></div>`;
        }
        if (type === "documentation") {
          html += `
          <figure class="documentation">
            <button class="btn btn--close-documentation">&times;</button>
            <div class="documentation-content">
              <ul class="documentation-nav">
                <li class="documentation-nav--item">1. Titulas</li>
                <li class="documentation-nav--item">2. Idejimas</li>
                <li class="documentation-nav--item">3. Norejimas</li>
              </ul>
              <article class="documentation--main">
                <h2>Dokumentacija</h2>
              </article>
            </div>
            <div class="documentation-nav--page">1/3</div>
          </figure>
          `;
        }
        if (type === "menu") {
          html += `
          <nav class="main-menu--container">
            <button class="btn btn--close-main-menu">&times;</button>
            <ul class="main-menu--nav">
              <li class="main-menu--nav__item project">
                <i class="main-menu--nav__icon ph-bold ph-house-line"></i>
                <button class="btn main-menu-nav--btn">Projektas</button>
              </li>
              <li class="main-menu--nav__item stations">
                <i class="main-menu--nav__icon ph-bold ph-nuclear-plant"></i>
                <button class="btn main-menu-nav--btn">Elektrinės</button>
              </li>
              <li class="main-menu--nav__item info">
                <i class="main-menu--nav__icon ph-bold ph-book-open-text"></i>
                <button class="btn main-menu-nav--btn">Žinynas</button>
              </li>
              <li class="main-menu--nav__item delete">
                <i class="main-menu--nav__icon ph-bold ph-eraser"></i>
                <button class="btn main-menu-nav--btn">
                  Išvalyti visus duomenis
                </button>
              </li>
            </ul>
            <a
              href="https://antanas-jasiulionis.lt/"
              class="main-menu--link"
              draggable="false"
              target="_blank"
              ><p>Apie <span>Elektro</span>map</p>
              <i class="ph-fill ph-arrow-circle-right"></i
            ></a>
          </nav>
          `;
        }

        html += '<div class="overlay"></div>';
        return html;
      };
      if (
        body.classList.contains("modal--open") ||
        body.classList.contains("documentation--open") ||
        body.classList.contains("main-menu--open")
      )
        return;

      body.insertAdjacentHTML("afterbegin", setHtml());
      setTimeout(() => body.classList.add(className), 10);
    };
    const removePopupWindow = function ({ instant = false } = {}) {
      if (!body.classList.contains(className)) return;

      body.classList.remove(className);

      if (!instant)
        return setTimeout(() => {
          popupWindow.parentElement.removeChild(popupWindow);
          overlay.parentElement.removeChild(overlay);
        }, 550);

      popupWindow.parentElement.removeChild(popupWindow);
      overlay.parentElement.removeChild(overlay);
    };
    const isPopupWindowExist =
      document.querySelector(".modal") ||
      document.querySelector(".documentation") ||
      document.querySelector(".main-menu--container") ||
      document.querySelector(".overlay");
    if (isPopupWindowExist) return;

    map.blur();
    createPopupWindow();

    let popupWindow;
    if (type === "modal") popupWindow = document.querySelector(".modal");
    if (type === "documentation")
      popupWindow = document.querySelector(".documentation");
    if (type === "menu")
      popupWindow = document.querySelector(".main-menu--container");
    const overlay = document.querySelector(".overlay");
    if (!popupWindow || !overlay) return;

    const abortListeners = new AbortController();
    const option = { signal: abortListeners.signal };

    // Do Actions on window buttons
    popupWindow.addEventListener(
      "click",
      (e) => {
        const btn = e.target;
        let btnClose = undefined;
        let btnReturn = undefined;
        let btnAction = undefined;
        let instant = false;

        if (type === "modal") {
          btnClose = btn.closest(".btn--close-modal");
          btnReturn = btn.closest(".btn--return-modal");
        }
        if (type === "documentation")
          btnClose = btn.closest(".btn--close-documentation");

        if (type === "menu") btnClose = btn.closest(".btn--close-main-menu");

        // Do Actions
        // Modal Window
        if (type === "modal" && !onlyDisplay) {
          btnAction = btn.closest(".btn--action-modal");
          if (btnAction) cbFunction.call(object, ...args);
        }

        // Main Menu
        if (type === "menu") {
          const isBtnContains = function (btnName) {
            return btnAction?.classList.contains(`${btnName}`);
          };
          btnAction = btn.closest(".main-menu--nav__item");

          if (
            isBtnContains("project") ||
            isBtnContains("stations") ||
            isBtnContains("info") ||
            isBtnContains("delete")
          )
            instant = true;

          // Project
          if (isBtnContains("project"))
            this.#changeActiveTab(null, { setManual: [true, 0] });

          // Stations
          if (isBtnContains("stations"))
            this.#changeActiveTab(null, { setManual: [true, 1] });

          // Documentation
          if (isBtnContains("info"))
            setTimeout(
              () => this._showPopupWindow(null, { type: "documentation" }),
              50,
            );

          // Delete
          if (isBtnContains("delete"))
            setTimeout(
              () =>
                this._showPopupWindow(
                  "Visi duomenys bus pašalinti<br/>Ar tikrai to norite?",
                  { onlyDisplay: false, cbFunction: app.resetLocalStorage },
                ),
              50,
            );

          // Link
          if (btn.closest(".main-menu--link"))
            btnAction = btn.closest(".main-menu--link");
        }

        // Close popup Window when buttons clicked
        if (btnClose || btnReturn || btnAction) {
          abortListeners.abort();
          removePopupWindow({ instant });
        }
      },
      option,
    );

    // Close Window on escape and click on overlay
    overlay.addEventListener(
      "click",
      () => {
        abortListeners.abort();
        removePopupWindow();
      },
      option,
    );
    document.addEventListener(
      "keydown",
      (e) => {
        e.preventDefault();
        let className;
        if (type === "modal") className = "modal--open";
        if (type === "documentation") className = "documentation--open";
        if (type === "menu") className = "main-menu--open";

        if (e.key === "Escape" && body.classList.contains(className)) {
          abortListeners.abort();
          removePopupWindow();
        }
      },
      option,
    );
  }

  //Selection menu
  #showCreateStationFormSelectionMenu(e) {
    const formCreateNew = document.querySelector(".form__station--new");
    if (!formCreateNew) return;

    const formSelectorElement = document.querySelector(".form__selector");
    const formSelector = e.target.closest(".form__selector");
    const isSelection = e.target.classList.contains("form__selection");

    // Remove selections if pressed outside selection screen
    if (!formSelector) return formSelectorElement.classList.remove("open");
    if (formSelector && !isSelection) formSelector.classList.toggle("open");
  }
  #changeFormTypeCreateStationForm(e) {
    const form = document.querySelector(".form__station--new");

    const toggleForm = function (type) {
      const formSelector = document.querySelector(".form__selector");
      const btnSubmit = document.querySelector(
        ".form__station--new .form__btn--done",
      );

      document
        .querySelectorAll(".form__station--new [data-form]")
        .forEach((selector) => {
          // Remove all fields that is for manual/excel form
          selector.classList.add("hidden");

          // Add all fields that is used for manual/excel type form
          if (
            selector.dataset.form === type &&
            !selector.classList.contains("form__selection")
          )
            selector.classList.remove("hidden");

          // Add selection to menu for manual/excel form
          if (
            selector.classList.contains("form__selection") &&
            selector.dataset.form !== type
          )
            selector.classList.remove("hidden");
        });

      // Change Form type
      form.dataset.formType = type;

      // Remove open selections
      formSelector.classList.remove("open");

      // Make disable submit button
      if (!btnSubmit.classList.contains("form__btn--disable"))
        btnSubmit.classList.add("form__btn--disable");
    };
    const resetInputs = () => {
      const allFormInputs = form.querySelectorAll("input");
      const excelTextEl = form.querySelector(".excel__row--text");
      const btnSubmit = form.querySelector(".form__btn--done");

      // Reset all inputs
      allFormInputs.forEach((input) => {
        // Add invalid class to text inputs
        if (input.type === "text") input.classList.add("invalid");

        // Reset values
        if (input.type === "text" || input.type === "file") {
          this._removeErrorMessage(input);
          input.value = "";
        }

        // Remove Error message if exists for file
        if (input.type === "file") this._removeErrorMessage(input);

        // Add checked status to checkbox
        if (input.type === "checkbox") input.checked = true;
      });

      // Add invalid class to text inputs
      allFormInputs.forEach((input) => {
        if (input.type === "text") input.classList.add("invalid");
      });

      excelTextEl.textContent = "Nepasirinktas failas";
      btnSubmit.classList.add("form__btn--disable");
    };
    const formSelector = e.target.closest(".form__selector");
    if (!formSelector) return;

    const selection = e.target.closest(".form__selection");
    if (selection) {
      toggleForm(selection.dataset.form);
      resetInputs();
    }
  }

  //Mouse Events
  #showToolTip(e) {
    const createToolTip = function (element, desc) {
      // Create element
      const toolTip = document.createElement("div");
      //Add class
      toolTip.classList.add("tooltip");
      // Set description
      toolTip.innerHTML = desc;
      // Assign tooltip to parent element
      element.prepend(toolTip);
      setTimeout(() => sidebarContainer.classList.add("tooltip--show"), 10);
    };
    const displayToolTip = (element, desc, time = 1000) => {
      if (this.#toolTipTimeOut) clearTimeout(this.#toolTipTimeOut);
      this.#toolTipTimeOut = setTimeout(
        createToolTip.bind(null, element, desc),
        time,
      );
    };
    const element = e.target;
    const stationField = element.closest(".station__details");
    const button = element.closest(".form__btn");
    const formInputField = element.closest(".form__row");
    const coordsCheckBox = element.closest(".form--checkbox");
    const coordsCheckBoxMessage =
      "žymėti jei koordinatės nėra <br> globalios (WGS-84 arba Google)";
    const searchBarOpen = element.closest(".icon--search");
    const searchBarClose = element.closest(".icon--clear");
    const createNewStationBtn = element.closest(".btn--new__station");
    const inputFileText = element.closest(".excel__row--text");
    const dragBtn = element.closest(".drag__btn");

    // Return if tooltip already exists
    if (sidebarContainer.classList.contains("tooltip--show")) return;

    // Show tooltip if it's over balance and distance
    if (stationField)
      displayToolTip(stationField, stationField.dataset.description);

    // Show tooltip if it's over submit or cancell buttons
    if (button) displayToolTip(button, button.dataset.description);

    // Show tooltip if it's input, it does not contain input buttons, it does not contain checkbox or fileText input
    if (
      formInputField &&
      !formInputField.classList.contains("form__row--submit") &&
      !coordsCheckBox &&
      !inputFileText
    )
      displayToolTip(formInputField, formInputField.dataset.description);

    // Show tooltip input if it's checkbox
    if (coordsCheckBox) displayToolTip(coordsCheckBox, coordsCheckBoxMessage);

    // Show tooltip input for searchBar which is closed
    if (searchBarOpen)
      displayToolTip(searchBarOpen, searchBarOpen.dataset.description);

    // Show tooltip input for searchBar to clear and close it
    if (searchBarClose)
      displayToolTip(searchBarClose, searchBarClose.dataset.description);

    // Show tooltip create station form submit and cancel buttons
    if (createNewStationBtn)
      displayToolTip(
        createNewStationBtn,
        createNewStationBtn.dataset.description,
      );

    // Show tooltip on drag buttons
    if (dragBtn) displayToolTip(dragBtn, dragBtn.dataset.description);
  }
  #removeToolTip() {
    if (this.#toolTipTimeOut) clearTimeout(this.#toolTipTimeOut);
    if (!sidebarContainer.classList.contains("tooltip--show")) return;
    sidebarContainer.classList.remove("tooltip--show");

    const toolTip = document.querySelector(".tooltip");
    if (!toolTip) return clearTimeout(this.#toolTipTimeOut);

    setTimeout(() => toolTip.parentElement.removeChild(toolTip), 250);
  }

  //Input Events
  #errorMessage(e) {
    const formInput = e.target.closest(".form input");
    if (
      !formInput ||
      formInput.type === "checkbox" ||
      formInput.classList.contains("input--file")
    )
      return;

    this.#validInputs(formInput);
  }
  #restrictInputToNumbers(e) {
    const inputNumbersOnly = (element, isMinusAllowed = true) => {
      const regex = function (value) {
        return value
          .replace(/[^0-9.-]/g, "")
          .replace(/^([0-9.]+)-/, "-$1")
          .replace(/(?!^)-/g, "")
          .replace(/^(-?)\./, "$1")
          .replace(/(\..*)\./g, "$1");
      };
      const regexNoMinus = function (value) {
        return value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
      };

      const pos = element.selectionStart;
      const value = element.value;

      // Allow only numbers on input
      element.value = isMinusAllowed ? regex(value) : regexNoMinus(value);

      // . can be used only once
      if ((value.match(/\./g) || []).length > 1) {
        element.value = value.slice(0, pos - 1) + value.slice(pos);
        element.setSelectionRange(pos - 1, pos - 1);
      } else {
        // If it's not numbers, cursor position stays the same
        const newPos = isMinusAllowed
          ? regex(value.slice(0, pos)).length
          : regexNoMinus(value.slice(0, pos)).length;

        element.setSelectionRange(newPos, newPos);
      }
    };
    const formInput = e.target.closest(".form input");
    if (
      !formInput ||
      formInput.classList.contains("form__input--title") ||
      formInput.classList.contains("input--file") ||
      formInput.type === "checkbox"
    )
      return;

    inputNumbersOnly(
      formInput,
      !formInput.classList.contains("form__input--balance") &&
        !formInput.classList.contains("form__input--radius"),
    );

    return this;
  }
  #pasteCoordsSplit(e) {
    const inputLatitude = e.target.closest(".form__input--latitude");
    if (!inputLatitude) return;
    e.preventDefault();

    const inputLongitude = e.target
      .closest(".form__row--coords")
      .querySelector(".form__input--longitude");

    const [lat = "", lon = ""] = e.clipboardData
      .getData("text/plain")
      .trim()
      .split(/[,\s]+/)
      .map((value) => (Number.isFinite(+value) ? value : ""));

    inputLatitude.value = lat;
    inputLongitude.value = lon;

    // Remove error message if exists
    if (lat) this._removeErrorMessage(inputLatitude);
    if (lon) this._removeErrorMessage(inputLongitude);
  }

  // Change Input Event
  #checkFileFormatExcel(e) {
    const inputFileEl = e.target.closest(".input--file");
    if (!inputFileEl) return;

    const btnSubmit = e.target
      .closest(".form__station--new")
      .querySelector(".form__btn--done");
    const inputText = e.target
      .closest(".excel__row")
      .querySelector(".excel__row--text");

    const file = inputFileEl.files[0];
    const fileFormat = file.name.toLowerCase().split(".").slice(-1)[0].trim();
    const errorMsg = "Blogas failo formatas, pasirinkite .xlsx";

    // Change input text to file name
    inputText.textContent =
      inputFileEl.files.length !== 0 ? file.name : "Nepasirinktas failas";

    // Check if format is NOT xlsx
    if (fileFormat !== "xlsx") {
      this.#createErrorMessage(inputFileEl, errorMsg);
      btnSubmit.classList.add("form__btn--disable");
    }
    // Check if format is xlsx
    if (fileFormat === "xlsx") {
      this._removeErrorMessage(inputFileEl);
      btnSubmit.classList.remove("form__btn--disable");
    }

    return this;
  }

  // Utilities
  #createErrorMessage(element, desc) {
    const form = element.closest(".form");
    const submitBtn = form.querySelector(".form__btn--done");

    // Create element
    const errorMsg = document.createElement("div");
    //Add class
    errorMsg.classList.add("error__msg");

    // Set description
    errorMsg.textContent = desc;

    // Find parent element of input and other sibling inputs
    const parentElement = element.classList.contains("form__input--balance")
      ? element.closest(".station__balance")
      : element.closest(".form__row");

    // Add invalid class to input
    element.classList.add("invalid");

    // Disable submit button
    if (!submitBtn.classList.contains("form__btn--disable"))
      submitBtn.classList.add("form__btn--disable");

    // Add to parent element message
    if (parentElement.classList.contains("error__msg--show")) return;
    parentElement.prepend(errorMsg);
    setTimeout(() => parentElement.classList.add("error__msg--show"), 10);

    return this;
  }
  _removeErrorMessage(element) {
    const form = element.closest(".form");
    const submitBtn = form.querySelector(".form__btn--done");

    // Find parent element of input
    const parentElement = element.classList.contains("form__input--balance")
      ? element.closest(".station__balance")
      : element.closest(".form__row");

    // Find all parent inputs, exclude checkbox
    const inputs = [...parentElement.querySelectorAll("input")].filter(
      (input) => input.type !== "checkbox",
    );

    const errorMsg = parentElement.querySelector(".error__msg");

    // Remove invalid class from input
    element.classList.remove("invalid");

    // Check if all form inputs are valid
    const isFormValidInputs = ![...form.querySelectorAll("input")]
      .filter((input) => input.type !== "checkbox")
      .some((input) => input.classList.contains("invalid"));

    // Make submit button active
    if (isFormValidInputs && submitBtn.classList.contains("form__btn--disable"))
      submitBtn.classList.remove("form__btn--disable");

    if (
      inputs.some((input) => input.classList.contains("invalid")) ||
      !parentElement.classList.contains("error__msg--show")
    )
      return;
    // Remove show message class from parent
    parentElement.classList.remove("error__msg--show");

    // Remove error message
    setTimeout(() => parentElement.removeChild(errorMsg), 250);

    return this;
  }
  #validInputs = throttle(
    (input) => {
      const errorMsg = "Laukas negali būti tuščias";

      if (
        input.value.length === 0 ||
        (input.classList.contains("form__input--balance") && input.value < 0)
      ) {
        this.#createErrorMessage(input, errorMsg);
      } else {
        this._removeErrorMessage(input);
      }

      return this;
    },
    1000,
    false,
  );
  _addLoader() {
    const mainContent = document.querySelector(".main-content");
    const loader = document.createElement("div");
    if (sidebarContainer.classList.contains("loading")) return;

    tabs.forEach((button) => (button.disabled = true));

    loader.classList.add("loader");
    mainContent.prepend(loader);
    setTimeout(() => sidebarContainer.classList.add("loading"), 10);
  }
  _removeLoader({ instant = false } = {}) {
    setTimeout(
      () => {
        const loader = document.querySelector(".loader");
        if (!sidebarContainer.classList.contains("loading") || !loader) return;

        tabs.forEach((button) => (button.disabled = false));
        sidebarContainer.classList.remove("loading");
        setTimeout(() => loader.parentElement.removeChild(loader), 250);
      },
      instant ? 15 : 500,
    );
  }
}

const ui = new UI();
const app = new App();
