class PlaceList extends HTMLElement {
  constructor() {
    super();

    // Get Site Studio custom component form data
    this.config = JSON.parse(this.parentNode.getAttribute('data-ssa-custom-component'));
    this.baseUrl = this.config.baseurl.replace(/\/+$/, '');
    this.filterTitle = this.config.filtertitle;
    this.filterNumber = this.config.filternumber;

    // Define the SVG placeholder (Base64 encoded)
    this.svgPlaceholderBase64 = `data:image/svg+xml;base64,${btoa(`
      <svg width="100%" height="100%" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#e0e0e0"/>
        <text x="50%" y="50%" alignment-baseline="middle" text-anchor="middle" fill="#888" font-size="16">No Image</text>
      </svg>
    `)}`;

    this.imageCache = new Map();
  }

  connectedCallback() {
    this.render();
  }

  async fetchData(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Fetch error: ${response.status} ${response.statusText}`);
    return await response.json();
  }

  async fetchById(type, id) {
    const url = `${this.baseUrl}/jsonapi/${type}/${id}`;
    if (this.imageCache.has(url)) {
      return this.imageCache.get(url);
    }
    const data = await this.fetchData(url);
    this.imageCache.set(url, data.data);
    return data.data;
  }

  async getImageUrl(mediaId, mediaType) {
    if (mediaType === 'media--acquia_dam_image_asset') {
      const mediaAsset = await this.fetchById('media/acquia_dam_image_asset', mediaId);
      return mediaAsset?.attributes?.acquia_dam_embed_codes?.original?.href || '';
    } else {
      const mediaImage = await this.fetchById('media/image', mediaId);
      const fileId = mediaImage?.relationships?.image?.data?.id;
      return fileId ? await this.getFileUrl(fileId) : '';
    }
  }

  async getFileUrl(fileId) {
    const file = await this.fetchById('file/file', fileId);
    return file ? `${this.baseUrl}${file.attributes.uri.url}` : '';
  }

  async render() {
    const resultDiv = document.createElement('div');
    resultDiv.id = 'result';
    this.appendChild(resultDiv);
    resultDiv.innerHTML = '';

    if (!this.baseUrl) {
      resultDiv.innerHTML = '<p>Base URL is not set. Please configure the base URL.</p>';
      return;
    }

    try {
      const placeData = await this.fetchData(`${this.baseUrl}/jsonapi/node/place`); // Updated for places
      const places = placeData.data || [];

      // Filter and sort places
      const filteredPlaces = places
        .filter(place => {
          const title = place.attributes.title.toLowerCase();
          return !this.filterTitle || title.includes(this.filterTitle.toLowerCase());
        })
        .sort((a, b) => a.attributes.title.localeCompare(b.attributes.title));

      const limitedPlaces = this.filterNumber ? filteredPlaces.slice(0, this.filterNumber) : filteredPlaces;

      if (limitedPlaces.length === 0) {
        resultDiv.innerHTML = '<p>No results found.</p>';
        return;
      }

      const resultsHtml = await Promise.all(limitedPlaces.map(async place => {
        const title = place.attributes.title;
        const placeImageRelationship = place.relationships?.field_place_image?.data; // Assuming a field for place image
        const imageUrl = placeImageRelationship
          ? await this.getImageUrl(placeImageRelationship.id, placeImageRelationship.type)
          : this.svgPlaceholderBase64;

        const pathAlias = place.attributes.path?.alias || '#';

        return `
          <div class="place-card">
            <a href="${this.baseUrl}${pathAlias}" target="_blank">
              <div class="image-container">
                <img src="${imageUrl || this.svgPlaceholderBase64}" alt="${title}">
              </div>
              <div class="title">${title}</div>
            </a>
          </div>
        `;
      }));

      resultDiv.innerHTML = resultsHtml.join('');
    } catch (error) {
      resultDiv.innerHTML = `<p>Error fetching data: ${error.message}</p>`;
    }
  }
}

customElements.define('place-list', PlaceList);
