class RemoteContent extends HTMLElement {
    constructor() {
        super();

        // Parse and initialize the configuration data
        this.config = JSON.parse(this.parentNode.getAttribute('data-ssa-custom-component'));
        this.baseUrl = this.config.baseurl.replace(/\/+$/, '');
        this.imageStyle = this.config.imagestyle;
        this.layoutStyle = this.config.layoutstyle;

        // Set the remote content type and related properties
        this.setRemoteType();

        // Define the SVG placeholder (Base64 encoded)
        this.svgPlaceholderBase64 = `data:image/svg+xml;base64,${btoa(`
            <svg width="100%" height="100%" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                <rect width="100%" height="100%" fill="#e0e0e0"/>
                <text x="50%" y="50%" alignment-baseline="middle" text-anchor="middle" fill="#888" font-size="16">No Image</text>
            </svg>
        `)}`;

        // Cache to store image and data fetch results
        this.imageCache = new Map();
    }

    // Sets the type and configuration fields for the content type
    setRemoteType() {
        this.remoteType = this.config.remotetype;

        const typeMapping = {
            article: {
                image: this.config.articleimage,
                filterNumber: this.config.filternumberarticle,
                taxonomyField: this.config.taxonomyfieldarticle,
                taxonomyType: this.config.taxonomytypearticle,
                taxonomyTerm: this.config.taxonomytermarticle
            },
            event: {
                image: this.config.eventimage,
                filterNumber: this.config.filternumberevent,
                taxonomyField: this.config.taxonomyfieldevent,
                taxonomyType: this.config.taxonomytypeevent,
                taxonomyTerm: this.config.taxonomytermevent
            },
            person: {
                image: this.config.personimage,
                filterNumber: this.config.filternumberperson,
                taxonomyField: this.config.taxonomyfieldperson,
                taxonomyType: this.config.taxonomytypeperson,
                taxonomyTerm: this.config.taxonomytermperson
            },
            place: {
                image: this.config.placeimage,
                filterNumber: this.config.filternumberplace,
                taxonomyField: this.config.taxonomyfieldplace,
                taxonomyType: this.config.taxonomytypeplace,
                taxonomyTerm: this.config.taxonomytermplace
            },
            product: {
                image: this.config.productimage,
                filterNumber: this.config.filternumberproduct,
                taxonomyField: this.config.taxonomyfieldproduct,
                taxonomyType: this.config.taxonomytypeproduct,
                taxonomyTerm: this.config.taxonomytermproduct
            },
            custom: {
                image: this.config.customimage,
                filterNumber: this.config.filternumbercustom,
                taxonomyField: this.config.taxonomyfieldcustom,
                taxonomyType: this.config.taxonomytypecustom,
                taxonomyTerm: this.config.taxonomytermcustom,
                customType: this.config.customtype
            }
        };

        const selectedType = typeMapping[this.remoteType] || {};
        this.remoteImage = selectedType.image;
        this.filterNumber = selectedType.filterNumber;
        this.remoteTaxonomyField = selectedType.taxonomyField;
        this.remoteTaxonomyType = selectedType.taxonomyType;
        this.remoteTaxonomyTerm = selectedType.taxonomyTerm;

        // For custom type, override the remoteType
        if (this.remoteType === 'custom') {
            this.remoteType = selectedType.customType;
        }
    }

    connectedCallback() {
        this.render();
    }

    // Fetch data from a given URL
    async fetchData(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Fetch error: ${response.status} ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            console.error(`Error fetching data: ${error.message}`);
            throw error;
        }
    }

    // Fetch resource by its type and ID with caching
    async fetchById(type, id) {
        const url = `${this.baseUrl}/jsonapi/${type}/${id}`;
        if (this.imageCache.has(url)) {
            return this.imageCache.get(url);
        }
        const data = await this.fetchData(url);
        this.imageCache.set(url, data.data);
        return data.data;
    }

    // Generate the URL for the image style
    async getImageStyleUrl(file) {
        const filePath = file.attributes.uri.value.split('public://')[1];
        const basePath = file.attributes.uri.url.replace('/' + filePath, '');
        const imageUrl = `${this.baseUrl}${basePath}/styles/${this.imageStyle}/public/${filePath}`;

        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(imageUrl);
            img.onerror = () => resolve(file ? `${this.baseUrl}${file.attributes.uri.url}` : '');
            img.src = imageUrl;
        });
    }

    // Fetch file URL for a media file
    async getFileUrl(fileId) {
        const file = await this.fetchById('file/file', fileId);
        return this.getImageStyleUrl(file);
    }

    // Fetch image URL based on media type and ID
    async getImageUrl(mediaId, mediaType) {
        if (mediaType === 'media--acquia_dam_image_asset') {
            const mediaAsset = await this.fetchById('media/acquia_dam_image_asset', mediaId);
            return mediaAsset?.attributes?.acquia_dam_embed_codes?.[this.imageStyle]?.href ||
                   mediaAsset?.attributes?.acquia_dam_embed_codes?.original?.href || '';
        } else {
            const mediaImage = await this.fetchById('media/image', mediaId);
            const fileId = mediaImage?.relationships?.image?.data?.id;
            return fileId ? await this.getFileUrl(fileId) : '';
        }
    }

    // Fetch taxonomy terms for filtering
    async fetchTaxonomyTerms() {
        const taxonomyTermsUrl = `${this.baseUrl}/jsonapi/taxonomy_term/${this.remoteTaxonomyType}`;
        const termsData = await this.fetchData(taxonomyTermsUrl);
        return termsData.data; // Return the array of terms
    }

    // Main render function for fetching and displaying content
    async render() {
        const resultDiv = document.createElement('div');
        resultDiv.id = 'result';
        resultDiv.className = this.layoutStyle;
        this.appendChild(resultDiv);

        if (!this.baseUrl) {
            resultDiv.innerHTML = '<p>Base URL is not set. Please configure the base URL.</p>';
            return;
        }

        try {
            let contentUrl;

            // If taxonomy term is empty, fetch all content
            if (!this.remoteTaxonomyTerm) {
                contentUrl = `${this.baseUrl}/jsonapi/node/${this.remoteType}`;
            } else {
                // Fetch and filter by taxonomy terms
                const allTerms = await this.fetchTaxonomyTerms();
                const termData = allTerms.find(term => term.attributes.name === this.remoteTaxonomyTerm);
                const termId = termData?.id;

                if (!termId) {
                    resultDiv.innerHTML = '<p>No taxonomy term found.</p>';
                    return;
                }

                contentUrl = `${this.baseUrl}/jsonapi/node/${this.remoteType}?filter[${this.remoteTaxonomyField}.id]=${termId}`;
            }

            const remoteContentData = await this.fetchData(contentUrl);
            const contentItems = remoteContentData.data || [];

            // Sort content by title
            const sortedItems = contentItems.sort((a, b) => a.attributes.title.localeCompare(b.attributes.title));

            // Limit results if filterNumber is set
            const limitedItems = this.filterNumber ? sortedItems.slice(0, this.filterNumber) : sortedItems;

            if (limitedItems.length === 0) {
                resultDiv.innerHTML = '<p>No results found.</p>';
                return;
            }

            // Render each content item
            const resultsHtml = await Promise.all(limitedItems.map(async item => {
                const title = item.attributes.title;
                const imageUrl = item.relationships?.[this.remoteImage]?.data
                    ? await this.getImageUrl(item.relationships[this.remoteImage].data.id, item.relationships[this.remoteImage].data.type)
                    : this.svgPlaceholderBase64;

                const pathAlias = item.attributes.path?.alias || '#';

                return `
                    <div class="remote-content-card">
                        <a href="${this.baseUrl}${pathAlias}" target="_blank">
                            <div class="image-container">
                                <img src="${imageUrl}" alt="${title}">
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
