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

        // Initialize a hierarchical query log
        this.queryLog = [];
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
        if (!file || !file.attributes || !file.attributes.uri) {
            console.error('File data is missing or incomplete');
            return '';
        }

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
            this.queryLog.push({ query: `Image file: ${fileUrl}` });
        }
        return this.getImageStyleUrl(file);
    }

    // Fetch image URL and alt text based on media type and ID
    async getImageUrl(mediaId, mediaType) {
        const imageQueries = [];

        if (mediaType === 'media--acquia_dam_image_asset') {
            const { data: mediaAsset, url: mediaAssetUrl } = await this.fetchById('media/acquia_dam_image_asset', mediaId);
            if (this.showQueries) {
                imageQueries.push(`<strong>Image (DAM)</strong>: <a href="${mediaAssetUrl}" target="_blank" rel="noopener noreferrer">${mediaAssetUrl}</a>`);
            }
            const imageUrl = mediaAsset?.attributes?.acquia_dam_embed_codes?.[this.imageStyle]?.href ||
                mediaAsset?.attributes?.acquia_dam_embed_codes?.original?.href || '';
            const altText = mediaAsset?.attributes?.acquia_dam_alt_text || mediaAsset?.attributes?.name;
            return { imageUrl, altText, imageQueries, mediaType };
        } else {
            const { data: mediaImage, url: mediaImageUrl } = await this.fetchById('media/image', mediaId);
            if (this.showQueries) {
                imageQueries.push(`<strong>Image</strong>: <a href="${mediaImageUrl}" target="_blank" rel="noopener noreferrer">${mediaImageUrl}</a>`);
            }
            const fileId = mediaImage?.relationships?.image?.data?.id;
            const { data: fileData, url: fileUrl } = fileId ? await this.fetchById('file/file', fileId) : { data: null, url: null };

            if (this.showQueries) {
                imageQueries.push(`<strong>File</strong>: <a href="${fileUrl}" target="_blank" rel="noopener noreferrer">${fileUrl}</a>`);
            }

            const imageUrl = fileData ? await this.getImageStyleUrl(fileData) : '';
            const altText = mediaImage?.relationships?.image?.data?.meta?.alt || 'Image';
            return { imageUrl, altText, imageQueries, mediaType };
        }
    }

    // Fetch taxonomy term ID by taxonomy type and term name
    async getTaxonomyTermId(taxonomyType, termName) {
        const taxonomyUrl = `${this.baseUrl}${this.language}/jsonapi/taxonomy_term/${taxonomyType}?filter[name]=${termName}`;
        try {
            const taxonomyData = await this.fetchData(taxonomyUrl);
            if (this.showQueries) {
                this.queryLog.push({ query: `<strong>Taxonomy</strong>: <a href="${taxonomyUrl}" target="_blank" rel="noopener noreferrer">${taxonomyUrl}</a>` });
            }
            return taxonomyData.data.length > 0 ? taxonomyData.data[0] : null;
        } catch (error) {
            console.error(`Error fetching taxonomy term: ${error.message}`);
            return null;
        }
    }

    // Recursive function to render the query log as nested lists
    renderQueryLog(log, parentElement) {
        const ul = document.createElement('ul');

        log.forEach(item => {
            if (typeof item === 'string') {
                const li = document.createElement('li');
                li.innerHTML = item;
                ul.appendChild(li);
            } else if (typeof item === 'object' && item.query) {
                const li = document.createElement('li');
                li.innerHTML = item.query;
                ul.appendChild(li);
                if (item.children) {
                    this.renderQueryLog(item.children, li);
                }
            }
        });

        parentElement.appendChild(ul);
    }

    // Main render method
    async render() {
        // Ensure result and query divs exist in the DOM
        const resultDiv = document.createElement('div');
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
                this.queryLog.push({ query: `<strong>Remote type</strong>: <a href="${contentUrl}" target="_blank" rel="noopener noreferrer">${contentUrl}</a>` });
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
                    this.queryLog.push({ query: `<strong>Filtered content</strong>: <a href="${contentUrl}" target="_blank" rel="noopener noreferrer">${contentUrl}</a>` });
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
                    : { imageUrl: this.svgPlaceholderBase64, altText: 'No Image', imageQueries: [], mediaType: null };

                const { imageUrl, altText, imageQueries, mediaType } = mediaData;
                const pathAlias = item.attributes.path?.alias || '#';

                // Prepare a node query entry
                let nodeQueryEntry = null;
                if (this.showQueries) {
                    const nodeQueryUrl = `${this.baseUrl}${this.language}/jsonapi/node/${this.remoteType}/${item.id}`;
                    nodeQueryEntry = { query: `<strong>Node</strong>: <a href="${nodeQueryUrl}" target="_blank" rel="noopener noreferrer">${nodeQueryUrl}</a>`, children: [] };

                    // Add image queries as children
                    imageQueries.forEach(imageQuery => {
                        nodeQueryEntry.children.push(imageQuery);
                    });

                    this.queryLog.push(nodeQueryEntry);
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

            // Display the query log if enabled
            if (this.showQueries && this.queryLog.length > 0) {
                if (this.showQueries) {
                    const queryListContainer = document.createElement('div');
                    queryListContainer.classList.add('results');
                    queryListContainer.innerHTML = `<p><strong>Query Log:</strong></p>`;
                    this.renderQueryLog(this.queryLog, queryListContainer);
                    queryDiv.appendChild(queryListContainer);
                }
            }

        } catch (error) {
            resultDiv.innerHTML = `<p>Error fetching content: ${error.message}</p>`;
        }
    }

}

// Define the custom element
customElements.define('remote-content', RemoteContent);
