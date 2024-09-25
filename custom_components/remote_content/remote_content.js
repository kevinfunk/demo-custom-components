class RemoteContent extends HTMLElement {
  constructor() {
    super();

    // Get Site Studio custom component form data
    this.config = JSON.parse(this.parentNode.getAttribute('data-ssa-custom-component'));
    this.baseUrl = this.config.baseurl.replace(/\/+$/, '');
    this.filterTitle = this.config.filtertitle;
    this.filterNumber = this.config.filternumber;
    this.imageStyle = this.config.imagestyle;
    this.layoutStyle = this.config.layoutstyle;

    // Set remote type and fields
    this.setRemoteType();

    // Define the SVG placeholder (Base64 encoded)
    this.svgPlaceholderBase64 = `data:image/svg+xml;base64,${btoa(`
      <svg width="100%" height="100%" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#e0e0e0"/>
        <text x="50%" y="50%" alignment-baseline="middle" text-anchor="middle" fill="#888" font-size="16">No Image</text>
      </svg>
    `)}`;

    this.imageCache = new Map();
  }

  setRemoteType() {
    this.remoteType = this.config.remotetype;

    switch (this.remoteType) {
      case 'article':
        this.remoteImage = this.config.articleimage;
        break;
      case 'event':
        this.remoteImage = this.config.eventimage;
        break;
      case 'person':
        this.remoteImage = this.config.personimage;
        break;
      case 'place':
        this.remoteImage = this.config.placeimage;
        break;
      case 'custom':
        this.remoteType = this.config.customtype;
        this.remoteImage = this.config.customimage;
        break;
      default:
        this.remoteImage = null;
        break;
    }
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

  getImageStyleUrl(file) {
    const imageStyle = this.imageStyle;
    const filePath = file.attributes.uri.value.split('public://')[1];
    const basePath = file.attributes.uri.url.replace('/' + filePath, '');
    const imageUrl = `${this.baseUrl}${basePath}/styles/${imageStyle}/public/${filePath}`;

    // Return a promise to handle image load asynchronously
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        resolve(imageUrl);
      };
      img.onerror = () => {
        const fallbackUrl = file ? `${this.baseUrl}${file.attributes.uri.url}` : '';
        resolve(fallbackUrl);
      };
      img.src = imageUrl;
    });
  }

  async getFileUrl(fileId) {
    const file = await this.fetchById('file/file', fileId);
    return this.getImageStyleUrl(file);
  }

  async getImageUrl(mediaId, mediaType) {
    if (mediaType === 'media--acquia_dam_image_asset') {
      const mediaAsset = await this.fetchById('media/acquia_dam_image_asset', mediaId);
      if (this.imageStyle) {
        return mediaAsset?.attributes?.acquia_dam_embed_codes?.[this.imageStyle]?.href || '';
      } else {
        return mediaAsset?.attributes?.acquia_dam_embed_codes?.original?.href || '';
      }
    } else {
      const mediaImage = await this.fetchById('media/image', mediaId);
      const fileId = mediaImage?.relationships?.image?.data?.id;
      return fileId ? await this.getFileUrl(fileId) : '';
    }
  }

  async render() {
    const resultDiv = document.createElement('div');
    resultDiv.id = 'result';
    resultDiv.className = this.layoutStyle;
    this.appendChild(resultDiv);
    resultDiv.innerHTML = '';

    if (!this.baseUrl) {
      resultDiv.innerHTML = '<p>Base URL is not set. Please configure the base URL.</p>';
      return;
    }

    try {
      const remoteContentData = await this.fetchData(`${this.baseUrl}/jsonapi/node/${this.remoteType}`);
      const contentItems = remoteContentData.data || [];

      // Filter and sort content
      const filteredItems = contentItems
        .filter(item => {
          const title = item.attributes.title.toLowerCase();
          return !this.filterTitle || title.includes(this.filterTitle.toLowerCase());
        })
        .sort((a, b) => a.attributes.title.localeCompare(b.attributes.title));

      const limitedItems = this.filterNumber ? filteredItems.slice(0, this.filterNumber) : filteredItems;

      if (limitedItems.length === 0) {
        resultDiv.innerHTML = '<p>No results found.</p>';
        return;
      }

      const resultsHtml = await Promise.all(limitedItems.map(async item => {
        const title = item.attributes.title;
        const itemImageRelationship = item.relationships?.[this.remoteImage]?.data;
        const imageUrl = itemImageRelationship
          ? await this.getImageUrl(itemImageRelationship.id, itemImageRelationship.type)
          : this.svgPlaceholderBase64;

        const pathAlias = item.attributes.path?.alias || '#';

        return `
          <div class="remote-content-card">
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

customElements.define('remote-content', RemoteContent);
