class PersonList extends HTMLElement {
  constructor() {
    super();

    // Get Site Studio custom component form data
    this.config = JSON.parse(this.parentNode.getAttribute('data-ssa-custom-component'));
    this.baseUrl = this.config.baseurl;
    this.filterName = this.config.filtername;
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
      const personData = await this.fetchData(`${this.baseUrl}/jsonapi/node/person`);
      const people = personData.data || [];

      // Filter and sort people
      const filteredPeople = people
        .filter(person => {
          const name = person.attributes.title.toLowerCase();
          return !this.filterName || name.includes(this.filterName.toLowerCase());
        })
        .sort((a, b) => a.attributes.title.localeCompare(b.attributes.title));

      const limitedPeople = this.filterNumber ? filteredPeople.slice(0, this.filterNumber) : filteredPeople;

      if (limitedPeople.length === 0) {
        resultDiv.innerHTML = '<p>No results found.</p>';
        return;
      }

      const resultsHtml = await Promise.all(limitedPeople.map(async person => {
        const title = person.attributes.title;
        const personImageRelationship = person.relationships?.field_person_image?.data;
        const imageUrl = personImageRelationship
          ? await this.getImageUrl(personImageRelationship.id, personImageRelationship.type)
          : this.svgPlaceholderBase64;

        const pathAlias = person.attributes.path?.alias || '#';

        return `
          <div class="person-card">
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

customElements.define('person-list', PersonList);
