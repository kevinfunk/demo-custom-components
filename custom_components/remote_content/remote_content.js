class RemoteContent extends HTMLElement {
    constructor() {
        super();

        // Parse and initialize the configuration data
        this.config = JSON.parse(this.parentNode.getAttribute('data-ssa-custom-component'));

        if (this.config.baseurl) {
            this.baseUrl = this.config.baseurl.replace(/\/+$/, '');
        }

        this.language = this.config.language;
        this.customlanguagecode = this.config.customlanguagecode;

        if (this.language && this.language !== 'custom') {
            this.language = '/' + this.language;
        } else if (this.language === 'custom') {
            this.language = '/' + this.customlanguagecode;
        }

        this.filterNumber = this.config.numberofresults;
        this.imageStyle = this.config.imagestyle;
        this.layoutStyle = this.config.layoutstyle;

        this.repeatertaxonomyarticle = this.config.repeatertaxonomyarticle || [];
        this.repeatertaxonomyevent = this.config.repeatertaxonomyevent || [];
        this.repeatertaxonomyperson = this.config.repeatertaxonomyperson || [];
        this.repeatertaxonomyplace = this.config.repeatertaxonomyplace || [];
        this.repeatertaxonomyproduct = this.config.repeatertaxonomyproduct || [];
        this.repeatertaxonomycustom = this.config.repeatertaxonomycustom || [];

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
                image: 'field_article_image',
                taxonomyRepeater: this.repeatertaxonomyarticle
            },
            event: {
                image: 'field_event_image',
                taxonomyRepeater: this.repeatertaxonomyevent
            },
            person: {
                image: 'field_person_image',
                taxonomyRepeater: this.repeatertaxonomyperson
            },
            place: {
                image: 'field_place_image',
                taxonomyRepeater: this.repeatertaxonomyplace
            },
            product: {
                image: 'field_product_image',
                taxonomyRepeater: this.repeatertaxonomyproduct
            },
            custom: {
                image: this.config.customimage,
                customType: this.config.customtype,
                taxonomyRepeater: this.repeatertaxonomycustom
            }
        };

        const selectedType = typeMapping[this.remoteType] || {};
        this.remoteImage = selectedType.image;
        this.remoteRepeaterTaxonomy = selectedType.taxonomyRepeater || [];

        // For custom type, override the remoteType
        if (this.remoteType === 'custom') {
            this.remoteType = selectedType.customType;
        }

        // Helper function to transform taxonomy filter object
        const transformTaxonomyFilter = (filterObj) => {
            const transformed = {};
            const keys = Object.keys(filterObj);

            // Assuming the order: [taxonomyField, taxonomyType, taxonomyTerm]
            transformed.taxonomyField = filterObj[keys[0]];
            transformed.taxonomyType = filterObj[keys[1]];
            transformed.taxonomyTerm = filterObj[keys[2]];

            return transformed;
        };

        // Transform repeatertaxonomy to have expected keys
        this.repeatertaxonomy = Object.values(this.remoteRepeaterTaxonomy || {})
            .map(filterObj => transformTaxonomyFilter(filterObj))
            .filter(filter => filter !== null);
    }

    connectedCallback() {
        this.render();
    }

    // Fetch data from a given URL
    async fetchData(url) {
        try {
            const response = await fetch(url);
            if (response.status === 404) {
                // If a 404 error is encountered, reset the language to empty
                this.language = '';
                // Retry fetching data with the updated language
                const updatedUrl = url.replace(/\/[a-z]{2}(\/|$)/, '/');
                return await this.fetchData(updatedUrl);
            }
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
        const url = `${this.baseUrl}${this.language}/jsonapi/${type}/${id}`;
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

    // Fetch image URL and alt text based on media type and ID
    async getImageUrl(mediaId, mediaType) {
        if (mediaType === 'media--acquia_dam_image_asset') {
            const mediaAsset = await this.fetchById('media/acquia_dam_image_asset', mediaId);
            const imageUrl = mediaAsset?.attributes?.acquia_dam_embed_codes?.[this.imageStyle]?.href ||
                             mediaAsset?.attributes?.acquia_dam_embed_codes?.original?.href || '';
            const altText = mediaAsset?.attributes?.acquia_dam_alt_text || mediaAsset?.attributes?.name;
            return { imageUrl, altText };
        } else {
            const mediaImage = await this.fetchById('media/image', mediaId);
            const fileId = mediaImage?.relationships?.image?.data?.id;
            const file = fileId ? await this.fetchById('file/file', fileId) : null;
            const imageUrl = file ? await this.getFileUrl(fileId) : '';
            const altText = mediaImage?.relationships?.image?.data?.meta?.alt || 'Image'; // Default alt text if none is provided
            return { imageUrl, altText };
        }
    }

    // Fetch taxonomy term ID by taxonomy type and term name
    async getTaxonomyTermId(taxonomyType, termName) {
        const taxonomyUrl = `${this.baseUrl}${this.language}/jsonapi/taxonomy_term/${taxonomyType}?filter[name]=${encodeURIComponent(termName)}&page[limit]=1`;

        try {
            const data = await this.fetchData(taxonomyUrl);
            const term = data.data[0];
            return term || null;
        } catch (error) {
            console.error(`Error fetching taxonomy term "${termName}" for type "${taxonomyType}": ${error.message}`);
            return null;
        }
    }

    // Main render function for fetching and displaying content
    async render() {
        const resultDiv = document.createElement('div');
        resultDiv.id = 'result';
        resultDiv.className = this.layoutStyle;
        this.appendChild(resultDiv);

        if (!this.baseUrl) {
            resultDiv.innerHTML = '<div class="notice">The website address is not set. Please check the component settings.</div>';
            return;
        }

        try {
            let contentUrl;

            if (this.repeatertaxonomy.length === 0) {
                // No taxonomy filters applied, fetch all content
                contentUrl = `${this.baseUrl}${this.language}/jsonapi/node/${this.remoteType}`;
            } else {
                // Initialize filters array
                const filters = [];

                // Create an array of promises to fetch all taxonomy term IDs in parallel
                const termPromises = this.repeatertaxonomy.map(taxonomy => {
                    const { taxonomyType, taxonomyTerm } = taxonomy;
                    if (taxonomyType && taxonomyTerm) {
                        return this.getTaxonomyTermId(taxonomyType, taxonomyTerm);
                    } else {
                        console.warn('Incomplete taxonomy filter configuration:', taxonomy);
                        return Promise.resolve(null);
                    }
                });

                const termResults = await Promise.all(termPromises);

                termResults.forEach((termData, index) => {
                    if (termData && termData.id) {
                        const { taxonomyField } = this.repeatertaxonomy[index];
                        const filterString = `filter[${taxonomyField}.id]=${termData.id}`;
                        filters.push(filterString);
                    } else {
                        const { taxonomyType, taxonomyTerm } = this.repeatertaxonomy[index];
                        if (!taxonomyTerm) {
                            console.warn(`Taxonomy term is empty for type "${taxonomyType}". Skipping filter.`);
                        } else {
                            console.warn(`Taxonomy term "${taxonomyTerm}" not found in type "${taxonomyType}".`);
                        }
                    }
                });

                // Combine all filters using '&' for AND logic
                const filterQuery = filters.join('&');
                contentUrl = `${this.baseUrl}${this.language}/jsonapi/node/${this.remoteType}?${filterQuery}`;
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
                const mediaData = item.relationships?.[this.remoteImage]?.data
                    ? await this.getImageUrl(item.relationships[this.remoteImage].data.id, item.relationships[this.remoteImage].data.type)
                    : { imageUrl: this.svgPlaceholderBase64, altText: 'No Image' };

                const { imageUrl, altText } = mediaData;
                const pathAlias = item.attributes.path?.alias || '#';

                return `
                    <div class="remote-content-card">
                        <a href="${this.baseUrl}${this.language}${pathAlias}" target="_blank">
                            <div class="image-container">
                                <img src="${imageUrl}" alt="${altText}">
                            </div>
                            <div class="title">${title}</div>
                        </a>
                    </div>
                `;
            }));

            resultDiv.innerHTML = resultsHtml.join('');

        } catch (error) {
            resultDiv.innerHTML = `<p>Error fetching content: ${error.message}</p>`;
        }
    }

}

customElements.define('remote-content', RemoteContent);
