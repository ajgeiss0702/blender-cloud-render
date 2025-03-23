FROM nvidia/cuda:11.8.0-runtime-ubuntu22.04 as base

# Adapted from https://github.com/Vogete/blender-cuda-docker/blob/master/blender2.92/cuda11.3/ubuntu20.04/Dockerfile
# for newer blender versions

ENV BLENDER_MAJOR 4.4
ENV BLENDER_VERSION 4.4.0
ENV BLENDER_TAR_URL https://download.blender.org/release/Blender${BLENDER_MAJOR}/blender-${BLENDER_VERSION}-linux-x64.tar.xz

RUN apt-get update && \
	apt-get install -y \
        xz-utils \
        libxkbcommon-x11-0 libsm6 libxext6 \
		curl wget nano \
		bzip2 libfreetype6 libgl1-mesa-dev \
		libglu1-mesa \
		libxi6 libxrender1 && \
	apt-get -y autoremove

# Install blender

RUN mkdir /usr/local/blender && \
	wget ${BLENDER_TAR_URL} -O blender.tar.xz && \
	tar -xvf blender.tar.xz -C /usr/local/blender --strip-components=1 && \
	rm blender.tar.xz

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN wget -qO- https://get.pnpm.io/install.sh | ENV="$HOME/.shrc" SHELL="$(which sh)" sh -
RUN pnpm env use --global lts
COPY . /app
WORKDIR /app


FROM base AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run build

FROM base
COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=build /app/dist /app/dist
ENTRYPOINT [ "pnpm", "start" ]
#CMD [ "pnpm", "start" ]