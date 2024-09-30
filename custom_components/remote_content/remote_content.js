class RemoteContent extends HTMLElement {
    constructor() {
        super();

        // Parse and initialize the configuration data
        this.config = JSON.parse(this.parentNode.getAttribute('data-ssa-custom-component'));

        // Initialize baseUrl
        this.baseUrl = this.config.baseurl ? this.config.baseurl.replace(/\/+$/, '') : `${window.location.protocol}//${window.location.hostname}${window.location.port ? ':' + window.location.port : ''}`;

        // Initialize language settings
        this.language = this.initializeLanguage(this.config.language, this.config.customlanguagecode);

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

        // Flag to display query output
        this.showQueries = this.config.showqueries;

        // Initialize a variable to store queries
        this.queryLog = '';
    }

    // Helper method to initialize the language
    initializeLanguage(language, customLanguageCode) {
        if (language && language !== 'custom') {
            return '/' + language;
        } else if (language === 'custom') {
            return '/' + customLanguageCode;
        }
        return '';
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

        // Return the URL for logging if queries are shown
        if (this.showQueries) {
            return { data: this.imageCache.has(url) ? this.imageCache.get(url) : await this.fetchData(url).then(d => d.data), url };
        }

        if (this.imageCache.has(url)) {
            return { data: this.imageCache.get(url), url };
        }
        const data = await this.fetchData(url);
        this.imageCache.set(url, data.data);
        return { data: data.data, url };
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
        const { data: file, url: fileUrl } = await this.fetchById('file/file', fileId);
        if (this.showQueries) {
            this.queryLog += `Image file query: ${fileUrl}<br />`;
        }
        return this.getImageStyleUrl(file);
    }

    // Fetch image URL and alt text based on media type and ID
    async getImageUrl(mediaId, mediaType) {
        if (mediaType === 'media--acquia_dam_image_asset') {
            const { data: mediaAsset, url: mediaAssetUrl } = await this.fetchById('media/acquia_dam_image_asset', mediaId);
            if (this.showQueries) {
                this.queryLog += `Image query (DAM): ${mediaAssetUrl}<br />`;
            }
            const imageUrl = mediaAsset?.attributes?.acquia_dam_embed_codes?.[this.imageStyle]?.href ||
                             mediaAsset?.attributes?.acquia_dam_embed_codes?.original?.href || '';
            const altText = mediaAsset?.attributes?.acquia_dam_alt_text || mediaAsset?.attributes?.name;
            return { imageUrl, altText };
        } else {
            const { data: mediaImage, url: mediaImageUrl } = await this.fetchById('media/image', mediaId);
            if (this.showQueries) {
                this.queryLog += `Image query: ${mediaImageUrl}<br />`;
            }
            const fileId = mediaImage?.relationships?.image?.data?.id;
            const file = fileId ? await this.fetchById('file/file', fileId) : null;
            const imageUrl = file ? await this.getFileUrl(fileId) : '';
            const altText = mediaImage?.relationships?.image?.data?.meta?.alt || 'Image'; // Default alt text if none is provided
            return { imageUrl, altText };
        }
    }

    // Fetch taxonomy term ID by taxonomy type and term name
    async getTaxonomyTermId(taxonomyType, termName) {
        const taxonomyUrl = `${this.baseUrl}${this.language}/jsonapi/taxonomy_term/${taxonomyType}?filter[name]=${termName}`;
        try {
            const taxonomyData = await this.fetchData(taxonomyUrl);
            if (this.showQueries) {
                this.queryLog += `Taxonomy query: ${taxonomyUrl}<br />`;
            }

            return taxonomyData?.data?.[0] || null;
        } catch (error) {
            console.error(`Error fetching taxonomy term ID: ${error.message}`);
            return null;
        }

    }

    // Main render method
    async render() {
        // Ensure result and query divs are present in the DOM
        const resultDiv = document.createElement('div');
        resultDiv.id = 'result';
        resultDiv.className = this.layoutStyle;
        this.appendChild(resultDiv);

        const queryDiv = document.createElement('div');
        queryDiv.id = 'query';
        this.appendChild(queryDiv);

        if (!resultDiv || !queryDiv) {
            console.error('Result or query div not found in the DOM.');
            return;
        }

        if (!this.baseUrl || !this.remoteType) {
            resultDiv.innerHTML = '<p>The website address not set. Please add it to the component.</p>';
            return;
        }

        try {
            let contentUrl = `${this.baseUrl}${this.language}/jsonapi/node/${this.remoteType}`;
            if (this.showQueries) {
                this.queryLog += `Content query: ${contentUrl}<br />`;
            }
            let queryOutput = '';

            const filters = [];

            // Handle taxonomy filtering
            if (this.repeatertaxonomy && this.repeatertaxonomy.length > 0) {
                const termPromises = this.repeatertaxonomy.map(taxonomy => {
                    const { taxonomyField, taxonomyType, taxonomyTerm } = taxonomy;
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

                if (this.showQueries) {
                    this.queryLog += `Filtered content query: ${contentUrl}<br />`;
                }
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

                // Log the query for each item
                if (this.showQueries) {
                    this.queryLog += `Node query: ${this.baseUrl}${this.language}/jsonapi/node/${this.remoteType}/${item.id}<br />`;
                    this.queryLog += `Image query: ${imageUrl}<br />`;
                }

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

            // Show the final query log as an unordered list
            if (this.showQueries) {
                const queryListItems = this.queryLog.split('<br />').map(query => {
                    return query ? `<li>${query}</li>` : ''; // Create list items for each query
                }).join('');

                queryDiv.innerHTML = `
                    <div = class="results">
                        <p><strong>Query Log:</strong></p>
                        <ul>${queryListItems}</ul>
                    </div>
                `;
            }

        } catch (error) {
            resultDiv.innerHTML = `<p>Error fetching content: ${error.message}</p>`;
        }
    }

}

// Define the custom element
customElements.define('remote-content', RemoteContent);
