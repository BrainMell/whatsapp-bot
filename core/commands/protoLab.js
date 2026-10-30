'use strict';

// Experimental WhatsApp protocol probes for the installed Baileys build.
// This module is intentionally isolated from RPG systems. It never claims a
// Meta AI origin; rich-response probes omit isForwarded and forwardOrigin.

const { randomUUID, randomBytes } = require('crypto');
const { generateWAMessageFromContent, prepareWAMessageMedia, proto } = require('@whiskeysockets/baileys');

const REPO_URL = 'https://github.com/BrainMell/whatsapp-bot';

function makeId() {
    return randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase();
}

function responseData(sections) {
    return Buffer.from(JSON.stringify({
        __typename: 'GenAIUnifiedResponse',
        response_id: randomUUID(),
        sections
    })).toString('base64');
}

function htmlEnvelope(html, forwardedOrigin = 0) {
    const rich = {
        messageType: 1,
        unifiedResponse: {
            data: responseData([{
                __typename: 'GenAIUnifiedResponseSection',
                view_model: {
                    __typename: 'GenAISingleLayoutViewModel',
                    primitive: {
                        __typename: 'FOAHtmlPrimitiveDemoDONOTUSE',
                        trusted_sources: [],
                        payload: String(html).trim()
                    }
                }
            }])
        }
    };
    // 💡 2026-10-30 (owner: "used to work, now it says update"): the classic
    // 8efe5aede envelope carries isForwarded + forwardOrigin 4 (fakes a
    // forwarded Meta AI message) — the ONLY delivery owner-confirmed to
    // render. forwardOrigin > 0 re-enables that shape.
    if (forwardedOrigin) {
        rich.contextInfo = { isForwarded: true, forwardOrigin: forwardedOrigin };
    }
    return {
        botForwardedMessage: {
            message: { richResponseMessage: rich }
        }
    };
}

// 💡 CLASSIC delivery (2026-10-30): single plain relay of the forwarded-origin
// envelope, NO MESSAGE_EDIT replay. Owner report: edit-replay envelopes now
// render as an "update WhatsApp" prompt on his (fully updated) client, while
// this classic shape is what rendered on day one (8efe5aede, "Holy fuck it
// worked"). Menu + dashboard ship this way; the probes keep testing the rest.
async function sendClassicHtml(sock, chatId, senderJid, html) {
    return relayContent(sock, chatId, senderJid, htmlEnvelope(html, 4));
}

function richEnvelope(sections) {
    return {
        botForwardedMessage: {
            message: {
                richResponseMessage: {
                    messageType: 1,
                    unifiedResponse: { data: responseData(sections) }
                }
            }
        }
    };
}

function section(primitive) {
    return {
        __typename: 'GenAIUnifiedResponseSection',
        view_model: { __typename: 'GenAISingleLayoutViewModel', primitive }
    };
}

function getUserJid(sock, fallback) {
    return sock?.user?.id || sock?.authState?.creds?.me?.id || fallback;
}

async function relayContent(sock, chatId, senderJid, content, relayOptions = {}) {
    const generated = generateWAMessageFromContent(chatId, content, {
        userJid: getUserJid(sock, senderJid),
        messageId: makeId()
    });
    await sock.relayMessage(chatId, generated.message, {
        messageId: generated.key.id,
        ...relayOptions
    });
    return generated;
}

// A compatibility experiment found in community Baileys implementations:
// replay the same rich payload through MESSAGE_EDIT. This is not a trust or
// signature bypass; it only tests whether the client renders the envelope
// without the extra download-consent step.
async function replayRichAsEdit(sock, chatId, senderJid, original) {
    const editType = proto?.Message?.ProtocolMessage?.Type?.MESSAGE_EDIT;
    if (editType === undefined) {
        throw new Error('MESSAGE_EDIT enum is unavailable in this Baileys build');
    }
    const editContent = {
        botForwardedMessage: {
            message: {
                protocolMessage: {
                    key: { remoteJid: chatId, fromMe: true, id: original.key.id },
                    type: editType,
                    editedMessage: original.message
                }
            }
        }
    };
    const edit = generateWAMessageFromContent(chatId, editContent, {
        userJid: getUserJid(sock, senderJid),
        messageId: makeId()
    });
    await sock.relayMessage(chatId, edit.message, { messageId: edit.key.id });
    return edit;
}

async function sendRich(sock, chatId, senderJid, content, editReplay = true) {
    const original = await relayContent(sock, chatId, senderJid, content);
    if (editReplay) {
        try {
            await replayRichAsEdit(sock, chatId, senderJid, original);
        } catch (error) {
            console.error('[ProtoLab] Edit replay failed:', error?.stack || error);
        }
    }
    return original;
}

// ─── R2 media suite (owner 2026-10-30: "see what will accept pictures) ───

// 320x320 lab tile: if a client shows this picture, the envelope accepted an
// attached image. Injected at build time by scripts/protolab/make_tile.py.
const LAB_IMAGE_B64 = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgwKCA0MCwwPDg0QFCIWFBISFCkdHxgiMSszMjArLy42PE1CNjlJOi4vQ1xESVBSV1dXNEFfZl5UZU1VV1P/2wBDAQ4PDxQSFCcWFidTNy83U1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1P/wAARCAFAAUADASIAAhEBAxEB/8QAGwABAAIDAQEAAAAAAAAAAAAAAAMEAQUGAgf/xABOEAABAwIDBAQKBgQMBgMBAAABAAIDBBEFEiEGExQxM1FygTRBUlRhcZGSorEHFSIyU6EjQnPBFhc1NkNVYoKy0dLwJHSTlKPCY4Ph8f/EABgBAQEBAQEAAAAAAAAAAAAAAAABAgME/8QAJBEBAAECBwEBAQEBAQAAAAAAAAECEQMSEyEyUfDxMaFhIjP/2gAMAwEAAhEDEQA/AOJnmdG8AAcr6qLin9TUq+lHqUK07V11RVO6bin9TU4p/U1QojOertNxT+pqcU/qaoUQz1dpuKf1NTin9TVCiGertNxT+pqcU/qaoUQz1dpuKf1NTin9TVCiGertNxT+pqcU/qaoUQz1dpuKf1NTin9TVCiGertNxT+pqcU/qaoUQz1dpuKf1NTin9TVCiGertNxT+pqcU/qaoUQz1dpuKf1NTin9TVCiGertNxT+pqcU/qaoUQz1dpuKf1NTin9TVCiGertNxT+pqcU/qaoUQz1dpuKf1NTin9TVCiGertNxT+pqcU/qaoUQz1dpuKf1NTin9TVCiGertNxT+pqcU/qaoUQz1dpuKf1NUsEzpHkEDlfRVFNSdKfUjVFdU1RuVfSj1KFTVfSj1KFGa+UiIiMCIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgKak6U+pQqak6U+pG6OUFX0o9ShU1X0o9SgQr5SyrD4ImOLXT2I/sFVlcl8Kl7vki0REot3D5x8BTdw+cfAVIiOunHvqPdw+cfAU3cPnHwFSIhpx76j3cPnHwFN3D5x8BUiIace+o93D5x8BTdw+cfAVIiGnHvqPdw+cfAU3cPnHwFSIhpx76j3cPnHwFN3D5x8BUiIace+o93D5x8BTdw+cfAVIiGnHvqPdw+cfAU3cPnHwFSIhpx76j3cPnHwFN3D5x8BUiIace+o93D5x8BTdw+cfAVIiGnHvqPdw+cfAU3cPnHwFSIhpx76j3cPnHwFN3D5x8BUiIace+o93D5x8BTdw+cfAVIiGnHvqPdw+cfAU3cPnHwFSIhpx76j3cPnHwFN3D5x8BUiIace+o93D5x8BTdw+cfAVIiGnHvryyCJ7g1s9yf7BVdXIenj9Z+RVJHPEpiGVNSdKfUoFPSdKfUjNHKCr6UdlQKer6UdlQIV8pFcm8Kl7vkqatzeFSd3yRrD9/WEREegREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERB7h6eP1n5FUldg6eP1n5FUkcMUU9J0p7KgU9J0p7KMUcoKvpR2VAp6vpR2VAhXykVufwqTu+SqK3P4VJ3fJGsP39eUWER3ZViioarEJnRUcEk8jWF5awXIA5n/fjsOZVZfWtiNnxhGGCoqGN42pAc4lpDo2kAhmvtPLXTWwUYqqyw+TIup272fGE4gKumY1tHUnRjGkCJ1tR1a6kd4touVVaibxdlFhEVvNn9l63aGOZ9HLTsEJAdvXOF79VgepQY/gVVgFXHT1ckL3yMzgxEkWuR4wOpdr9FHgeI/tGfIrWfSn/AC7Sf8sP8TlHOKpz2chRUVTiFUympIXTTP5Nb/vQLs6P6NK2SMOq66GBx/VYwyEfmF0P0d4RHQ4CyscwcRV/aLiNQy+g/f3rm9ttra44vNQ4fUPp4Kc5HOjOVz3DnrzAHJEmqZm1L3WfRpWxxl1JXQzuH6r2GMn8yuMraKpw+qfTVcLoZmc2u/3qF2GxO1td9bw0OIVD6iCoORrpDdzHeLXmQeS6T6RMIjrsBfWNaOIpPtBwGpZfUfv7kIqmJtU+c7P4BVbQVMsFJJCx0bM5MriBa9vECpdodma3Z5kDqyWneJi4N3TnG1rc7gda330V/wAsVv7D/wBguh26wSqx2pwqmpW2AdIZJD92MfZ1P+SE1zFVnzbBcGrMbrRTUTAXWu57tGsHWStvimw9dhNC+rrK2gZEz/5H3ceoDLqV9DiiwvY3AiSckbfvOP35n/vPyXyvaPaCqx+uM05yQt0ihB0YP3n0oRVNU7fiXZ/Zet2hjmfRy07BCQHb1zhe/VYHqW4/i1xjzmg/6j/9K230UeB4j+0Z8is7f7RYpg+LU8OH1W5jfBncN211zmI8YPUhNVWa0NP/ABbYx5zQf9R/+lcrh9HJiFfBSQua2SZ4Y0vNgCetbn+HO0X9Yf8Agj/0qpsn/OnDf27fmjUZoibt7/FrjHnNB/1H/wCleJPo4xpjSWy0ch6myOv+bQvoG1dbUYds3WVVJJu542tLXZQbfaA5HTxrk9iNrMUxPG20VfK2eORjiHbtrS0gX8QGiOcVVzF3DYlhtZhVSaeugdDJa4B5EdYPIqovqf0owxOwCnmcBvWVAaw+Oxabj8h7F8rR1pqzRdlFhFWmUWEQZRYRBJB4RH6z8iqauQeER+s/IqmjjiinpOlPZUCnpOlPZRijlBWdKOyoFPWdKOyoEK+UitT+FSd3yVVWp/CpO75I1h+/ryiwrWGUE+KYhDRUoaZZTYZjYDS5J9QBKjs6HYTZ8YtiBq6ljXUdMdWPaSJXW0HVpoT3C2q+rKrhlBBheHw0VMHCKIWGY3J1uSfWSSrSjy1VZpUcZwuDGMMmo6hrbPH2HkX3braOHq/Pl418VxCjmw+vnpKhtpYXlrtDY+kX8R5j0FfeFx/0g4Bx9B9ZU7b1NKz9Jd1g6IXJ06xz8Wl+eirWHVabPl6LCI9D6X9FHgeI/tGfIrV/Sp/LtJ/yw/xOWz+ijwPEf2jPkVrPpU/l2k/5Yf4nI4x/6O+2Xc1+zGGFnLhmDvDQD+a+N7QNdHtDiTX/AHhUyX94rt/o52khFKMHq5BHI1xNO5xsHAm+X13v7Ve2s2H+ua411DPHDUPAEjJAcriPHccj3IUzlqm751s+10m0OGtZ941MdveC+ybUOazZjEy/lwzx3lpA/NaDZPYf6mrhXV08c1QwERsjBytJ8dzzPcqP0jbSQmlOD0kgkkc4Goc03DQDfL6729iFU5qoso/RV/LFb+w/9gvppkYJGxlzQ9wJa0nUgWv8wvmP0VfyxW/sP/YLa/SbVT0T8IqaaR0U0b5C1zeY0aiVReuyr9JWD4hLK3EmSPno422MQ/oes26j1r54vsmye1FPtFSGGYMZWsb+liPJ46x6PR4lyO22xpw4vxDDWE0Z1kiHOL0j+z8kaoqt/wAy2n0UeB4j+0Z8it/j+IbOUlXGzG2Uzpyy7N7TGU5bnx5T47rn/oo8DxH9oz5FXNtNkq/aDEoKiklpmMjhyESucDe5PiB60Zm2fdXxHGNi5MNqmU0VEJ3QvEeWhIOaxtY5NNVxGyf86cN/bt+a3v8AFrjHnNB/1H/6VpdmGGLa/D43WJZUhpt6CjcWtNpfZMWhoqjDZosTLBRuA3hkfkbzFrm4trZUsCwjA6LNUYNFAcwymWOUyd1ySoNuv5nYh2W/42r5xsPjZwfHYxI+1LUERygnQX5O7j+V1HOmmZpXfpErMUlxRlNXwthp2AugbG7M1/8Aavpc9wt8+QX2bbjBvrjAJN229TT/AKWK3M25t7x+dl8YVdaJvDKLCI2yiwiDKLCIJKfwiP1n5FVFbp/CI/WfkVUVcsQU9H0p7KgU9H0p7KMUcoYrOlHZUCnrOlHZUCGJykVuo8Kk7vkqit1HhUnd8kXD9/XhfU/o9wM4fhjq6oa3f1YBZqDljtceq/Mi/ib4wuC2bjw44myfF6hsNJAQ4tLc+8dfRuXU20Nza2ltLhfQqvb/AAOnybqSepzXvuoiMvrzW/LqUarmZ2h1KKrhlczEsOhrI4pYmTDM1srcrrX0NvTzHoIVpRwERaPHtqaPAKmKGrp6t29Zma+JgLTrYi5I1GntCLEXfPNtsDOD4y58bWtpKol8IBH2eWZtha1idPQR6Vq8FwqfGsSjoqZ8bJXgkGQkDQX8QK+gYztFs1juDPpaiudCZAHNJp3OdE7mPER6DY8iddV88oq2rwfEN/SStjqIiWh7crx1G3MH1qu9MzMPsGyOz38HcNkiklbLNK7PI5os0aaAf78a+c7fYpDiu0j3U7g+GBgha8cnEEkkd5I7lr6/aXGMRiMdViEz43aFjbMB9YFrrU3QppmJvLK3FHtTjdFGI4MRmDBoA+z7e8CtNdLo3+tzWbU43WxmOfEZiw6EMsy/ugLTrF0uhGy/hWMV2DTPlw+fcve3K45GuuOfjBUmLY9iWNNiGI1O+ERJZ+ja217X5AdQWsul0S0fqalqZqOpjqKaR0U0Zu17TqCt6duNoXNIdiAIOhBgj1+Fc5dLoTES2uGbQ4phO+4CpEAmdmeBEwgn1Eac/Er38Odov6x/8Ef+lc5dLoWh0f8ADnaL+sf/AAR/6VpKesnpq5lZDJlqGPztfYGzuu3JV7pdC0Q3ddtZjeI0clLV1u8gkADm7pgvrfmBfxLSrF0uhEW/HQx7bbQxRMjZiJysAaLwxk2HpLdVoZHullfI+2Z5LjYAC59A5LxdLoREQyixdLorKLF0ugyixdLoJafwiP1n5FU1bp/CI/WfkVUVcsT8j3Qp6PpT2VAp6PpT2UZw+UFZ0o7KgU9Z0o7KgQxOUitVHhUnd8lVVqp8Lk7vki4fv68L1HG+WRscbHPe8hrWtFy4nkAF4W52QpuL2qw6PPkyyiS9r/cGe3flt3qOszZ9ko6ZlHRQUsZcWQRtjaXcyALC/sUyIo8ouK+k+i3uEUtW1sjnU8paco+yGuGpPe1o712q0+19LxeyuIx58mWIyXtf7hz278tu9GqZtL4qiwir0t1SbOVNThrK7iaSGB99ZpC22ttdLc1FiGA1lBSipcYpqc/0sL8zV0dNT8XsBFDvoYc368zsrR+kPMqrVVlHhuyjsNbVxVVQ+4/QuzNFzfmpdu0Wa5uy9TwkNTJV0UMczQWb2Ut5i4HLmqWK4PV4U9gqWtLX/dew3aV1mK0Jr9l8LiFRTwENjOad+UH7HIelUdtJDBR0FBkeRG0HekaOsLaJEk0xENFhuC1mJRukha1kLPvSyOytHepqnZ6shpXVMT4KqFv3n08mey3mK/otgqMQaMdkz29NyfiUOwLnmqq2amIsBI8V76fvS5aL2auj2fkrWxbnEMP3kjQREZvtjS9iLc1mr2dloxIJsQw5skbcxjMxDjpe1iOa94CGN2wibFbdiV4bbqs6y87YfzkqfUz/AAhE2tdVw3BazEo3SQtayFn3pZHZWjvU1Ts9WQ0rqmJ8FVC37z6eTPZbzFf0WwVGINGOyZ7em5PxKHYFzzVVbNTEWAkeK99P3pdbRezk1sqPBKmswqevjfEIYc2YOJzGwubaelUqwMbWztituxI4Nt1X0XV7P/zIxP8A+3/AFZZpi8uPW2wjZ6sxenfNTuiYxrst5CRc+iwK1I1NhzX0Lg6/DsGw+nw+AySMe189ntb6SNSOZNu5SZWmLuCqqd9LUywSiz43FrrdYW3GzFSKOGplrKGGKZoc0yylvMXA5c1a25odziMdW0WbO2zu0P8A8stpi3A/wWwz6w4jdZY7bjLe+Tx38XNLrl3lyuKYNV4VkdUBjo5PuyRuu0rXrsdqv0+ztBLSEGhblsHD7Q0sP3hcarDNUWllFhERlFhEGUWEQS03hMfrPyKqK3TeEx+s/Iqoq5Yn5HuhT0fSnsqBT0fSnsozh8oKzpR2VXVis6UdlV0MTlIrVT4XJ3fJVVaqfC5O75ItH57/AFGuy+jeWjpMRrKusrYKbLEI2tleG58xuSCT4so9q41FHSYvFn3T6+wj+taH/uGf5p9fYR/WtD/3DP8ANfC0Rz04fdPr7CP61of+4Z/mn19hH9a0P/cM/wA18LRDThPWQsp62eCOVs0ccjmNlbyeAbBw9fNQIiOrcux2+zQwnhuX9Ln/ALWblb960yIhM3bnE8d+sMHpaHht3w+X7ee+azbcraL1U4/xmBMw+ppt5JHbJPvLEW5aW6tOa0iJZc0txhuPS0dE+ingZV0bv6J5tb1FTHaIU9HJT4XRR0LZPvvDy9x7ytCiWM0rmFVv1diUNXu95uyTkzWvcEc+9esYxD60xKSr3W6zgfYzZrWAHOw6lRREvtZuMNx6Wjon0U8DKujd/RPNreoqY7RCno5KfC6KOhbJ994eXuPeVoUSy5pFvcI2gjw/CpqGWi4iOVzi473JoQBbl6FokRImzdNxTCo5I5IsFyPY8OB4px5G9rEKtjeKOxfEDUuj3QyhrWZs1gPTb1rXIi5pbifGxUbPw4bLTXdEQWTZ+Wp8Vuo25q3JtJS1GG01HV4Xv2QNaAeILbkC19AucRLGaW5xbH34hRxUcVOympY7WY03OnLVaZERJm4iIgIiICIiCWm8Jj9Z+RVRW6XwmPv+RVRVzxPyPdCsUfSnsqurFH0p7KMYfKCs6UdlV1YrOlHZVdFxOUitVXhcnd8lVVqq8Lk7vki0fnv9RosIo6MosIgyiwiDKLCIMosIgyiwiDKLCIMosIgyiwiDKLCIMosIgyiwiDKLCIMosIgyiwiDKLCIJqXwmPv+RVRWqXwlnf8AIqqq51/ke6FYo+lPZVdWKPpT2UZw+UFb0w7KrqxW9MOyq6LicpFZqvC5O75KsrlRGJJ3PbNEAbc3ehFo/Pf6gRe9wfx4feTcH8eH3lG93hF73B/Hh95Nwfx4feQ3eEXvcH8eH3k3B/Hh95Dd4Re9wfx4feTcH8eH3kN3hF73B/Hh95Nwfx4feQ3eEXvcH8eH3k3B/Hh95Dd4Re9wfx4feTcH8eH3kN3hF73B/Hh95Nwfx4feQ3eEXvcH8eH3k3B/Hh95Dd4Re9wfx4feTcH8eH3kN3hF73B/Hh95Nwfx4feQ3eEXvcH8eH3k3B/Hh95Dd4Re9wfx4feTcH8eH3kN3hF73B/Hh95Nwfx4feQ3eEXvcH8eH3k3B/Hh95Dd4Re9wfx4feTcH8eH3kN3ql8Kj7/kVVVynjEczXumiIF+TvQqarFf5ArFF0x7KrqxRdMeyjOHygremHZVdWK3ph2VXRcTlIiLMbHSSNYwXc4gAdZRhhFsMVwTEMH3fH0xhEt8hztde3PkT1r1V4DiVFh0ddU0xjppMuV5e3W4uNL3/JBrUW9j2Ox6WJkjKG7HgOad9HqD/eVSkwDEqyuqKOnps9RTkiVm8aMutuZNj3INai2mIbOYthsJmq6KRkQ5vBDgPWQTZVxhVa7CnYkIf+Da7KZMzed7cr38fUgpotlhuA4nisEk1DSmaOM5XOztGtr21Oq1qAi2OF4FiWLxyPoKbfNjIDjna2x7yFjE8DxLCWtdXUr4WuNg64cL9VwSEGvRb1mx+OyQtlZQEsc0OBErNQfRmWpdR1Law0joJOJDsu6ynNfqsggRbmbZTHIaczPw+TIBc5XNcfYDdV8LwHEsXjkfQU2+bGbOOdrbHvIQa5FsMTwTEcJDTX0r4WvNmuuHAnquCQrsex2PSxMkZQ3Y8BzTvo9Qf7yDRIpKmnlpKmSnnbklicWvbcGxHPktvT7I45VU0U8NFmilaHsdvWC4IuDq5BpEW7fsjjkc0UT6K0kt8g3rNbC5/WVOPBcQlgrJmU946MkTnO37BHPx68vEgoIpaSlmraqOmp2Z5pDlY24Fz6ytvNsfjsEEk0tDljjaXOO+YbAC5/WQaNEW2pdmcYrKMVUFBI+Ei4dcAuHWATcoNSis0eH1ddV8LTU8kk+t2Aai3O/V3qbE8FxHCSzjqV8Ifo03DgfRcXCCgi2lVs5i1FQGtqaN0VO213Pc0EXNh9m9/wAlq0BERAREQEREBWKLpj2VXVii6Y9lGsPlBW9MOyq6nremHZVdDE5Syp6Hw+n/AGrfmq69RvdHI17DZzSCD1FGH1nFo6bGsVmwescGiARVUbv7N7PHs+foWn2oxEYpsS6qaLRurMsYt+qCQPyC4fEcRqsUquIrZd7NlDc2UN0HoACy7FKx2FNw0zf8G1+cR5Rz672v4+tFu7jav6n4LCPrbj83D/o+FyW5NvfN3Kl9H26+ssW3Gfc7k5M9s2W+l7eOy00e2WPRRMjZX2YwBrRuY9AP7qqU20GJ0lfUVkFTkqKjpX7tpzdxFh3IOm+jrfWxDic31ZuTnz/cv/8Ay91FHb+K2oy8uJ094LQYhtHi2JQmGrrZHxHmwANB9YAF1DDjNfDhwoY5wKUSCTdljT9oEG9yL8wEH0KiiOBYdg9KK+hpHtdv6tlROGOeHAggDx8z3tC4vbHDhhu0VQ1gtDN+mjtys7/9uFrMRxGrxSqNTWy72awbmygaD0AWXrEMVrMSbA2sm3ogbkj+w0EDquBry8aDrNi2RS7KY4yebcROFnyZS7IMp1sOaqYvi+GwbJx4LQ1Ulc7PmMzoywNF76A6/wCyufpMVraOiqKSnmyQVAtKzK05tLcyLjuVJB9VrKajmxDZySoxDhpo2AxRZD+lNm6ZuQ6vTdUcIkMv0mV762AQTboiJpN+QaAQfS0E+1cNXYvXYhw/FVBfwwyxENDS0adQHUFmtxrEK+riqqmpLqiIWZI1oY4d7QELui2X+sv4eu3u9z55OJzXtax5+i9rdy3VBwXD7WZs/B712fc2zWsb5b6c7rjptrMcmpzC/EJMhFjla1p9oF1XwvHsSwiORlBU7lshu4ZGuue8FB1OPCGf6PqN2GGUUMM2oqR+kOpHMacz4lZ2r+p+Cwj624/Nw/6PhcluTb3zdy43E8exPFo2x11W+VjTcNsGi/XYAK5Htlj0UTI2V9mMAa0bmPQD+6g0s+638m4z7nMcme2bLfS9vHZdT9G385X/APLu+bVzFXUzVlVJUVD880jsz3WAufUFLhuJ1eFVJqKGbdSlpbmyh2h9YPUg6PYn+e7/AFSrZYb/ACJtf+1k/wDZcVQ4nV4fXGspZt3UG/28oPPnoRZWqHaPFcPfO6kqt26ofvJDu2HM7r1GiD3sn/OjDv2wW52w+ovrjEN59ZfWHiy5N1myi3ptyWlqdp8Xq56eaerzyU7s8R3TBlPXoNe9Ty7Y49NE+KSuux7S1w3MeoP91Bo22zDNyvqvpGOb/wDhzgPC5uG3bcmT7trnN8Nl81W2pdpsYo6MUtPXyMhAsG2BLR1AkXCDuKfd/XG13B24ncjd5eebIb2/vLSsv/FbNxN83EjcZu0OXxfmuUo8Qq6Gr4qmqJI59bvB1N+d+vvU2J41iOLZOPqnzBn3W2DQO4WCF3SwSyTfRjiEkr3SPNULuebk6s8a4xb/APhrtB/WH/hj/wBK0Usr5pnyyHM97i5x6yeaDyiwiIyiwiDKLCIMqxRdMeyqysUXTHso3h8oK3ph2VXVit6YdlV0MTlIiKehaH19O1wDmmVoII0IujKBF0E8kNJh2I7pksb3VjoiYpAwWs6wtl+76L6rU0FMyqM8ZLhKIi+IDk4jUg9wKCqi2zMMgYxrp3yXjpuIma0i+pAa0aaGxBJN+aHDaeSmdUxOlETqd8jWuIJa5rgCCbajX0INSitVFMyKgpJ2l2abPmB5CxsLKWGmp48PbV1W9eJJDGxkTg3kASSSD1jRBQRbjDsMhrN210crBM8tjmdURsB1sLMIu702KhipaWPDnVNUJnPE5iyRuDRa173IKDWorOI0wo6+WBri5rT9knmQRcfNbGTC6R2L8BA6YFl3Plke21g3MQBYe0lBpUW4lwyC8JhBkc55a6nZVRyPItfMHNuANDe40SbB2vfRbh2QVMxhLTMyXKdNczdPHy56INOi3VqMYPiQpN8Mrowd6QcwzHXQC3q19ahw5tL9VVz6mB8jmOjsWPDSASeRLTZBq0W8bHSS4fhUdQJryOe0btwGUF/M3Bv6tFE2kAo2wTVBjjFfunkgZW6WLuv80GoRXsSpG0xYWQTxNcSAZHte13pDgAO5Tx0lAyiopag1BfUlwO7cAGAOtfUa+r80GqRboYbIYRQ737X1gYOQy3tbN1/moIG4ecUpo4o53tE7Wu3jm2eL87W09WqDWItrWU1K9lfNBHLFuJGtDS8OBuXX5NFhoNF6iw2m3g3r5QwUQqDlIvm6uXJBqEW3psOp5qU1ZDhE6QsjjdVRxkWAJJc4C/PkAqFdAymrJIopWysafsvaQQRz5jRBXREQEREBERAREQEREBWKLpj2VXVii6Y9lGsPlBW9MOyq6sVvTDsquhicpF7hkMM0crQC5jg4X5XC8KWmp5KqpjgiF3yODRojCWeulnimjc1gEs2+dYH72vL0ar1hT2RYjDNJOIWxODy7KSTY8gAOZ9OimOC1bW1AfFK2WItDY92byAki49GipGnmE+4MMm+vbd5Tmv6kFl+JynEaiqDWET3a6Nwu0tP6vdYexZ+tZhK0tihETYzEIADkynUjnfnre91Umhlp5DHPG+J4/Ve0g+wr1DS1E7HPhglkYz7zmMJA9dkElZXPq4oIjFFFHCCGNjBFgTfxkpT1zoacwPiinhLs4ZID9l3K4IIKjhpKmoF4KeWUXtdjC7XuXh0MjWOc6N4a12UktNger16IL9PjEsDoH8PTPkgcTE9zD9gE3sACBa5Pi08Sqvq5H0pgIbkMpluBrci3sXllLUSSNjZBK5725mtawkkdYHUpKeifK+pZJmifBE6Qtc3XS2no5oI6upfV1Lp5A0Oda4by0Fv3KV2IznEjXNytmJvYDTlYix8VlEKWoNOZxBKYRzkDDl9vJZ4Kq3Jl4abdAZi/dmwHXdBO3EjHOyWCmp4rXu1rSQ4EEEG5JtYnlZJcUldFBHFFDTtgkMke6BuHaeMk35KvDS1E7HPhglkYz7zmMJA9dlE1pc4NaCXE2AHMoL02KPlpp4G09PE2dwdIY2kEkG99Tp6uShpKw0zJWGKOaKUAPZJexsbg6EH814qKSppSBU08sN+W8YW39qw6mnZA2Z8ErYnfdkLCGnvQScbJlpW5WWpiSzQ63N9V6fiEr2ua5kZDpzOQW3+0fF6lDNTTwNa6aCWNr/ul7CA71XWZqWogY180EsbX/dL2EA+q6CSprXTwNgbDFDE1xfkjvq4i1zck+JXBibIcOoY2RQzSQ53fpGn7BLri2ov+YVCSiqoojJLTTMjBsXOjIAPrUtXhdZSMifLBIGStaWuDDa55Nvbn6EGPrGoyAZhnE+/3n62frSavdLK2VkEEMgeHl8bSCXdepNvULBQz009M4NqIZInEXAkYW39qsfVs7KOeeeOSHd5S1r4yM9zbS6D0cUJkmdwtPknH6SP7WVxvfN964PqISXFZpZHOMcTc0HD2a0gBvo15qtT0tRVFwp4JZi3UiNhdb2LDaeZ8ro2QyOkb95oaSR6wglp650NO6B8UU8JdnDJQdHcrgggrElS2SndHuImvdJnL2tAsALBo6h89FFNBLTyZJ4nxPtfK9pafzUhpXGGndEJJJJc32BGdLHxHx93JBXRWfq+tzhnB1GdwzBu6dcjr5LxBSVNQ9zYKeWVzPvBjC4t9dkEKKWOlqJZjDHBK+VvNjWEuHchppxM2IwSCV33WZDc+oIIkUk0MtPIY543xPH6r2kH2FRoCIiAiIgKxRdMeyq6sUXTHso3h8oK3ph2VXVit6YdlVkMTlLKmopGxV1PI82ayRrifQCoERhu5ncPTYs0TxXnews3crXZ25ndR/JTwVcAmYHvhdJJQNjDpHkND78nEEEaC3Nc6iLdscUmc9lPC5lKwRA5W08hfYE+Mlx/Iq/TVLDh9CadtGZafNnE8zoy12YnMLOAOlus6Ln0RG1nq82DyNbIxr31jpCyM2FsuhA526lcfLBV4rXUr6iJkNU1rhM5wyh7QDcn3h3rnkRXRMroKh2IxsbAS9zGwtneWNdGy4Dbgi2ljqbKE1Weoqt8aZhFEYmiJ5cDqLC5Jue8rRohd0UU8fFU9ZxMQpY6URviMgzXDLFmXmbnW/LW6mB3VVhdTLVRtp4aVmdjpAHWsbtDeZv6Fy6lmnknLN67NkYGN0tYDkELt3TVTDh9CadlGZKfNmE8zoy12YnMLOAOlus6LUsMU+KA1DmshkmvIYxo1pOtvQqqIjf1Zp48GnitSMO/Y5kcM5kLhZ1yftEey3p8SVEzBjgxB1TFJROmY7IJAXZLg5Sznp6RbRaBEW7b34XFYqiqqYqiA1DZHZJQ8vAN8xA5d+uqkxKoc2nqWNbQlk7wc8Uz3vfY3BsXG3eAtIiDqMSducTxCeapjdE+nMYj3gLiS0ADLz0Ot+Wigp5oWVuH1b5ITE2nEJJkF2PyuAJaDmte2o9q0dRPJUzummdmkdzNrXUSF2+4ttPNRsniomwR1LZXCCV0pt4zq51h6Fia8OFYk2athmdNIxzGslDi/U3d6PmtEiF2xwuKnkindIIXztLd3HPLu2ka3N7jUaaX8a2VTVRMxKskiniBdQBgdG/QuytBAJN78+eq5xEF+sla/CsPbnDns3gIvctGa4v8Amr+HVMURwlxmYwxNmzEuAyk3tfqWhREbI1Tv4Pti35z8UXlubX7o19quztpKjE8RlBp5pd40xNlmyMcDfMbgi55ePxlaBEV0uISw1Aq4Keop2yyRwOzCWzXhrbObmceux1N9OtSSzxw1wZPJFJJJh7I2ySOcGF2h1cCDqARe/wA1zlPUSUzi6Mt1FiHsDge4ghYqJ5amZ0szy97uZKF2xrM1VLSUjjQ04ZcNLJi5rQdftOJdp6itUsIiMosIgyiwiDKsUXTHsqsrNF0x7KN4fKCt6YdlVlZrumHZVZDE5SIilpIxNVwxOJDXva0252JRhEivTQU8c8bC1zGOJBLZ2Sn0GzRp+9Stw9jaiWB7JZZoos7mRG1zcaDQ+IoNYi2goIQ6e+Z27yWaZmx2zAkgki1xayUtBFOzNu5iDM6MvY8ObGABqTax5nW45KrZq0V+kpIZWxvlc/KXyB2Ujk1gdopYsMZYNmc7OZmsGUi2Qutfv1t6lEs1aLZCkpzVxxuDmRkPLi2dkhsGk+IacvGoZaZlMxrpg5/6RzSGOAuAAQQbHrQU0WwkpqbihExszWNYJHudID9nLmsPsjXWyjmpWxR1Dg4nI9gYetrgSD7AEFNFYoIW1FW2OS+UtcTZwbyaTzOg5KZ1PAxskr2vEbS1oYyZrySbn7wFradSCii2UVDG+QljZpWGDesYw2eftZbcj6fEjsPi/wCJa1z94zJkabaEtLi0+nS3rVLNaivzULWy00THHPJpITyaQde4fuXttNSb0jLO6N0bpWOEgGgB0Iy87ghQa1FIHQ765jk3Xk5xm9tv3LYikpHTSxtZNdkTZLuna0G+XS5bYfeQapFfZTQOfKMryWlobEyZribjU5rWPqA8axFFSmKoMkU+eEXP6QNv9oDllNuaCiiy4jMcoIF9ATdYQEREBERAREQEREBERAREQFZoumPZVZWaHpj2Ubw+UMV3TDsqurFd0w7KroYnKRe4ZTDPHK0AuY4OF+VwV4RGFniw2VskdPDG9tyC3MdevUnkscZIYiwhpuzdlx52uD+5V0QTwVO5ikjdFHKx5BIfm0IvbkR1lBVvaGCMNjDJDI3LfQm2mp5aKBEFlta9os1kbRmeQADYZm5T4+pYhrZoSDfOQWEZ7m2U6D1KuiCzxYEmeOnijdZwOUuN7gjxk9a8y1UktNFA8NyxXym2pv1+xQIgsivma974zu3va1mZhIIAAGh7gvf1jI+MsnjjnuBcyF1za9rkEeUVTRBLHOYpjIxrRcOGXWwBBH71mCoMLXsLGSRvsSx97XHI6aqFEFh9ZI8yXDAHxiPKBo1twdPYsurZXR5dA67TnFw67b2N+/8AIKsiCzHWzR5S0gPY1wa/XML8zfrWTiE7mjeO3rg1zQ55JNnCxF7qqiArLa1wle90cbw+MRua69rC1uRv+qFWRBO2oYHuPCwlpt9k5rDvvf8ANHVUj3VDnZSZ/vG3pB09igRAREQEREBERAREQEREBERAREQFYoemPZVdWKHpj2Ubw+UFd0w7KrqxXdMOyqyGJyllFhEYZRYRBlFhEGUWEQZRYRBlFhEGUWEQZRYRBlFhEGUWEQZRYRBlFhEGUWEQZRYRBlFhEGUWEQZRYRBlFhEGVYoemPZVZWaHpj2Ubw+UFd0w7KrK9U075ZA5paBa2qi4KTyme0o1XRVNUzZWRWeCk8pntKcFJ5TPaUZ06ulZFZ4KTyme0pwUnlM9pQ06ulZFZ4KTyme0pwUnlM9pQ06ulZFZ4KTyme0pwUnlM9pQ06ulZFZ4KTyme0pwUnlM9pQ06ulZFZ4KTyme0pwUnlM9pQ06ulZFZ4KTyme0pwUnlM9pQ06ulZFZ4KTyme0pwUnlM9pQ06ulZFZ4KTyme0pwUnlM9pQ06ulZFZ4KTyme0pwUnlM9pQ06ulZFZ4KTyme0pwUnlM9pQ06ulZFZ4KTyme0pwUnlM9pQ06ulZFZ4KTyme0pwUnlM9pQ06ulZFZ4KTyme0pwUnlM9pQ06ulZFZ4KTyme0pwUnlM9pQ06ulZFZ4KTyme0pwUnlM9pQ06ulZFZ4KTyme0pwUnlM9pQ06ulZFZ4KTyme0pwUnlM9pQ06ulZWaHpj2U4KTyme0qWmp3xSFzi0i1tFGqKKoqibP//Z';

let labImageCache = null;

// Uploads the tile once per process and returns a ready imageMessage proto
// that can be embedded into interactiveMessage headers, hydrated templates,
// carousel cards or legacy buttonsMessage headers.
async function labImageMessage(sock) {
    if (labImageCache) {
        return labImageCache;
    }
    // Baileys 7 contract: the VALUE of the media key is the media spec
    // (Buffer | {url} | {stream}); uploadData fields like jpegThumbnail ride
    // at the top level. Supplying jpegThumbnail skips thumbnail computation.
    const bytes = Buffer.from(LAB_IMAGE_B64, 'base64');
    const prep = await prepareWAMessageMedia(
        { image: bytes, jpegThumbnail: bytes },
        { upload: sock.waUploadToServer }
    );
    const media = prep?.imageMessage || prep?.image?.imageMessage || null;
    if (!media || !media.url) {
        throw new Error('prepareWAMessageMedia returned no uploaded imageMessage');
    }
    labImageCache = media;
    return labImageCache;
}

// externalAdReply block carrying the tile — the known trick for giving
// non-media envelopes (lists, polls) a picture banner.
function adReplyThumbnail(title, body) {
    return {
        title: String(title).slice(0, 60),
        body: String(body).slice(0, 80),
        mediaType: 1,
        thumbnail: LAB_IMAGE_B64,
        sourceUrl: REPO_URL,
        showAdAttribution: false,
        containsAutoReply: false,
        renderLargerThumbnail: true
    };
}

function makeDigits(n) {
    let out = '';
    for (let i = 0; i < n; i++) {
        out += Math.floor(Math.random() * 10);
    }
    return out;
}

// relay an interactiveMessage with the proven biz/native_flow node pattern
async function relayInteractive(sock, chatId, senderJid, interactive, flowName) {
    const content = { interactiveMessage: interactive };
    const generated = generateWAMessageFromContent(chatId, content, {
        userJid: getUserJid(sock, senderJid),
        messageId: makeId()
    });
    const additionalNodes = [{
        tag: 'biz',
        attrs: {},
        content: [{
            tag: 'interactive',
            attrs: { type: 'native_flow', v: '1' },
            content: [{ tag: 'native_flow', attrs: { v: '9', name: flowName } }]
        }]
    }];
    if (!String(chatId).endsWith('@g.us')) {
        additionalNodes.push({ tag: 'bot', attrs: { biz_bot: '1' } });
    }
    await sock.relayMessage(chatId, generated.message, {
        messageId: generated.key.id,
        additionalNodes
    });
    return generated;
}

// WEBVIEW suite — owner: "floating Web view".
// W1 modern cta_url + text header, W2 legacy open_webview, W3 open_webview +
// picture header, W4 cta_url + picture header. W3/W4 double as media probes.
async function sendWebviewSuite(sock, chatId, senderJid) {
    const ctaUrlParams = (label) => JSON.stringify({
        display_text: label,
        title: 'Joker Proto Lab',
        description: 'Floating web view probe',
        url: REPO_URL,
        merchant_url: REPO_URL
    });
    const tile = await labImageMessage(sock).catch(() => null);
    const variants = [];
    // W1 — modern cta_url button, text-only header
    await relayInteractive(sock, chatId, senderJid, {
        header: { title: 'JOKER PROTO LAB · W1', hasMediaAttachment: false },
        body: { text: 'Floating web view, modern CTA. Tap the button: should open INSIDE WhatsApp (in-app browser), not your main browser.' },
        footer: { text: 'W1 · cta_url · text header' },
        nativeFlowMessage: { buttons: [{ name: 'cta_url', buttonParamsJson: ctaUrlParams('Open floating web view (W1)') }], messageParamsJson: '' }
    }, 'cta_url');
    variants.push('W1 cta_url + text header');
    // W2 — legacy open_webview button, text-only header
    await relayInteractive(sock, chatId, senderJid, {
        header: { title: 'JOKER PROTO LAB · W2', hasMediaAttachment: false },
        body: { text: 'Floating web view, legacy open_webview button. In-app webview flag is set in the button params.' },
        footer: { text: 'W2 · open_webview · text header' },
        nativeFlowMessage: {
            buttons: [{
                name: 'open_webview',
                buttonParamsJson: JSON.stringify({
                    title: 'Open legacy webview (W2)',
                    link: { url: REPO_URL, in_app_webview: true, view_once: false }
                })
            }],
            messageParamsJson: ''
        }
    }, 'open_webview');
    variants.push('W2 open_webview + text header');
    // W3 — legacy open_webview + PICTURE header (media acceptance probe)
    if (tile) {
        await relayInteractive(sock, chatId, senderJid, {
            header: { title: 'JOKER PROTO LAB · W3', hasMediaAttachment: true, imageMessage: tile },
            body: { text: 'Webview card with a picture attached. If you see the JOKER PROTO LAB tile, open_webview accepted media.' },
            footer: { text: 'W3 · open_webview · image header' },
            nativeFlowMessage: {
                buttons: [{
                    name: 'open_webview',
                    buttonParamsJson: JSON.stringify({
                        title: 'Open picture webview (W3)',
                        link: { url: REPO_URL, in_app_webview: true, view_once: false }
                    })
                }],
                messageParamsJson: ''
            }
        }, 'open_webview');
        variants.push('W3 open_webview + image header (tile)');
    } else {
        variants.push('W3 SKIPPED (image upload failed)');
    }
    // W4 — modern cta_url + PICTURE header
    if (tile) {
        await relayInteractive(sock, chatId, senderJid, {
            header: { title: 'JOKER PROTO LAB · W4', hasMediaAttachment: true, imageMessage: tile },
            body: { text: 'Modern CTA card with a picture attached. If the tile shows, cta_url accepted media.' },
            footer: { text: 'W4 · cta_url · image header' },
            nativeFlowMessage: { buttons: [{ name: 'cta_url', buttonParamsJson: ctaUrlParams('Open picture webview (W4)') }], messageParamsJson: '' }
        }, 'cta_url');
        variants.push('W4 cta_url + image header (tile)');
    } else {
        variants.push('W4 SKIPPED (image upload failed)');
    }
    return sock.sendMessage(chatId, {
        text: 'WEBVIEW SUITE SENT\n\n' + variants.join('\n') +
            '\n\nNote: which buttons render, whether the browser opens in-app (floating) vs external, and whether W3/W4 show the JOKER PROTO LAB tile.'
    });
}

// MARKET suite — owner: "floating market boxes".
// P1 standalone productMessage (fake product id), P2 catalog_message native
// flow card with the tile, P3 orderMessage box with the tile as thumbnail.
async function sendMarketSuite(sock, chatId, senderJid) {
    const botJid = getUserJid(sock, senderJid);
    const tile = await labImageMessage(sock).catch(() => null);
    const variants = [];
    // P1 — standalone product card (no real catalog behind it)
    await relayContent(sock, chatId, senderJid, {
        productMessage: {
            product: {
                productId: makeDigits(16),
                title: 'Joker Proto Market Box (P1)',
                description: 'Standalone product card probe — no real catalog product behind this id. Does the floating box render anyway?',
                currencyCode: 'USD',
                priceAmount1000: '25000',
                retailerId: 'JOKER-LAB',
                url: REPO_URL,
                productImageCount: 1
            },
            businessOwnerJid: botJid
        }
    });
    variants.push('P1 productMessage (fake product, no image)');
    // P2 — catalog_message native-flow card with the tile
    if (tile) {
        await relayInteractive(sock, chatId, senderJid, {
            header: { title: 'JOKER PROTO LAB · P2', hasMediaAttachment: true, imageMessage: tile },
            body: { text: 'Floating market box via catalog_message native flow, picture attached. If the tile shows, the card accepted media.' },
            footer: { text: 'P2 · catalog_message · image header' },
            nativeFlowMessage: {
                buttons: [{
                    name: 'catalog_message',
                    buttonParamsJson: JSON.stringify({
                        product_id: makeDigits(16),
                        title: 'Proto Market Box P2',
                        description: 'Catalog card with attached image.',
                        currency_code: 'USD',
                        price_amount_1000: '42000',
                        retailer_id: 'JOKER-LAB',
                        url: REPO_URL,
                        product_image_count: 1
                    })
                }],
                messageParamsJson: ''
            }
        }, 'catalog_message');
        variants.push('P2 catalog_message card + image header (tile)');
    } else {
        variants.push('P2 SKIPPED (image upload failed)');
    }
    // P3 — order box with tile thumbnail
    await relayContent(sock, chatId, senderJid, {
        orderMessage: {
            orderId: makeDigits(16),
            thumbnail: Buffer.from(LAB_IMAGE_B64, 'base64'),
            itemCount: 2,
            status: proto?.Message?.OrderMessage?.OrderStatus?.INQUIRY ?? 1,
            surface: proto?.Message?.OrderMessage?.OrderSurface?.CATALOG ?? 1,
            message: 'Floating order box probe — 2 items, USD, tile attached as thumbnail.',
            orderTitle: 'Joker Proto Order (P3)',
            totalAmount1000: '85000',
            totalCurrencyCode: 'USD'
        }
    });
    variants.push('P3 orderMessage box + thumbnail (tile)');
    return sock.sendMessage(chatId, {
        text: 'MARKET SUITE SENT\n\n' + variants.join('\n') +
            '\n\nNote: which boxes render as floating market/order cards, and whether P2/P3 show the JOKER PROTO LAB tile.'
    });
}

// POLL suite — owner: "different versions of polls". Baseline single-select
// poll already lives at .j mod proto poll. Q1 multi-select, Q2 max options,
// Q3 raw PollCreationMessageV3 with the tile as an externalAdReply banner.
async function sendPollSuite(sock, chatId) {
    const variants = [];
    await sock.sendMessage(chatId, {
        poll: {
            name: 'Joker Proto Lab Q1: multi-select (pick up to 3)',
            values: ['Polls accepted a picture', 'Lists accepted a picture', 'Market boxes rendered', 'Webviews floated'],
            selectableCount: 3
        }
    });
    variants.push('Q1 multi-select poll (selectableCount 3)');
    await sock.sendMessage(chatId, {
        poll: {
            name: 'Joker Proto Lab Q2: maximum options (12)',
            values: ['opt-01', 'opt-02', 'opt-03', 'opt-04', 'opt-05', 'opt-06', 'opt-07', 'opt-08', 'opt-09', 'opt-10', 'opt-11', 'opt-12'],
            selectableCount: 1
        }
    });
    variants.push('Q2 twelve-option poll');
    // Q3 — raw V3 poll with picture banner (needs its own messageSecret so
    // votes can still decrypt, mirroring how Baileys builds sendMessage polls)
    const pollSecret = randomBytes(32);
    await relayContent(sock, chatId, sock?.user?.id, {
        pollCreationMessageV3: {
            name: 'Joker Proto Lab Q3: poll with picture banner',
            options: [{ optionName: 'I can see the tile' }, { optionName: 'Poll only, no picture' }, { optionName: 'Did not render' }],
            selectableOptionsCount: 1,
            contextInfo: {
                externalAdReply: adReplyThumbnail('JOKER PROTO LAB · Q3', 'Poll with attached image banner')
            }
        },
        messageContextInfo: { messageSecret: pollSecret }
    });
    variants.push('Q3 pollCreationMessageV3 + tile banner');
    return sock.sendMessage(chatId, {
        text: 'POLL SUITE SENT\n\n' + variants.join('\n') +
            '\n\nNote: whether Q1 allows picking 3, whether all 12 options of Q2 show, and whether Q3 displays the JOKER PROTO LAB tile banner.'
    });
}

// LIST suite — owner: "different versions of legacy lists". L1 is the
// classic probe (.j mod proto list). L2 two sections, L3 long list,
// L4 list with the tile as externalAdReply banner.
async function sendListSuite(sock, chatId, senderJid) {
    const listType = proto?.Message?.ListMessage?.ListType?.SINGLE_SELECT ?? 1;
    const build = (title, description, sections, footerText, contextInfo) => {
        const content = {
            listMessage: {
                title,
                description,
                buttonText: 'Open list',
                footerText,
                listType,
                sections
            }
        };
        if (contextInfo) {
            content.listMessage.contextInfo = contextInfo;
        }
        return generateWAMessageFromContent(chatId, content, {
            userJid: getUserJid(sock, senderJid),
            messageId: makeId()
        });
    };
    const relayList = async (generated) => {
        await sock.relayMessage(chatId, generated.message, {
            messageId: generated.key.id,
            additionalNodes: [{
                tag: 'biz',
                attrs: {},
                content: [{ tag: 'list', attrs: { v: '2', type: 'product_list' } }]
            }]
        });
    };
    const variants = [];
    // L2 — two sections with descriptions
    await relayList(build(
        'Joker Protocol Lab · L2',
        'Legacy list probe, TWO sections with row descriptions',
        [
            {
                title: 'Section A — envelopes',
                rows: [
                    { title: 'Polls', rowId: 'lab_l2_polls', description: 'Poll variants' },
                    { title: 'Lists', rowId: 'lab_l2_lists', description: 'Legacy list variants' },
                    { title: 'Market', rowId: 'lab_l2_market', description: 'Floating market boxes' }
                ]
            },
            {
                title: 'Section B — media',
                rows: [
                    { title: 'Webview', rowId: 'lab_l2_webview', description: 'Floating web views' },
                    { title: 'Media matrix', rowId: 'lab_l2_media', description: 'Picture-attach matrix' }
                ]
            }
        ],
        'L2 · two sections · row descriptions'
    ));
    variants.push('L2 two-section list with descriptions');
    // L3 — long list, five rows per section, no descriptions
    await relayList(build(
        'Joker Protocol Lab · L3',
        'Legacy list probe, LONG list (10 rows) without descriptions',
        [
            {
                title: 'Rows 1-5',
                rows: [1, 2, 3, 4, 5].map((n) => ({ title: 'Row option ' + n, rowId: 'lab_l3_a' + n }))
            },
            {
                title: 'Rows 6-10',
                rows: [6, 7, 8, 9, 10].map((n) => ({ title: 'Row option ' + n, rowId: 'lab_l3_b' + n }))
            }
        ],
        'L3 · long list · no row descriptions'
    ));
    variants.push('L3 long list (10 rows, no descriptions)');
    // L4 — list with picture banner
    await relayList(build(
        'Joker Protocol Lab · L4',
        'Legacy list probe with a PICTURE banner attached (externalAdReply). If the tile shows above this list, lists accept media.',
        [{
            title: 'Media check',
            rows: [
                { title: 'I see the tile banner', rowId: 'lab_l4_tile' },
                { title: 'List only, no banner', rowId: 'lab_l4_plain' },
                { title: 'Did not render', rowId: 'lab_l4_dead' }
            ]
        }],
        'L4 · list + image banner',
        { externalAdReply: adReplyThumbnail('JOKER PROTO LAB · L4', 'List with attached image banner') }
    ));
    variants.push('L4 list + tile banner');
    return sock.sendMessage(chatId, {
        text: 'LIST SUITE SENT\n\n' + variants.join('\n') +
            '\n\nNote: section headers, row descriptions and whether L4 shows the JOKER PROTO LAB tile banner.'
    });
}

// MEDIA suite — owner: "see what will accept pictures being attached".
// X1 native flow + tile header, X2 classic business template + tile,
// X3/X3b carousel (floating cards) + tile, X4 ancient buttonsMessage + tile.
async function sendMediaSuite(sock, chatId, senderJid) {
    const tile = await labImageMessage(sock).catch(() => null);
    const variants = [];
    if (tile) {
        // X1 — native flow card with picture header
        await relayInteractive(sock, chatId, senderJid, {
            header: { title: 'JOKER PROTO LAB · X1', hasMediaAttachment: true, imageMessage: tile },
            body: { text: 'Native flow card with picture attached. Tile = media accepted.' },
            footer: { text: 'X1 · flow buttons · image header' },
            nativeFlowMessage: {
                buttons: [
                    { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: 'Quick reply (X1)', id: 'proto_x1_qr' }) },
                    { name: 'cta_copy', buttonParamsJson: JSON.stringify({ display_text: 'Copy code', id: 'proto_x1_copy', copy_code: 'JOKER-PROTO-TEST' }) },
                    { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: 'Open repo', url: REPO_URL }) }
                ],
                messageParamsJson: ''
            }
        }, 'mixed');
        variants.push('X1 native flow + tile header');
        // X2 — classic hydrated business template with picture
        await relayContent(sock, chatId, senderJid, {
            templateMessage: {
                hydratedTemplate: {
                    imageMessage: tile,
                    hydratedTitle: 'JOKER PROTO LAB · X2',
                    hydratedContentText: 'Classic business template (hydrated four row) with a picture header. Tile = media accepted.',
                    hydratedFooterText: 'X2 · hydrated template · image header',
                    hydratedButtons: [
                        { quickReplyButton: { displayText: 'Quick reply (X2)', id: 'proto_x2_qr' } },
                        { urlButton: { displayText: 'Open repo', url: REPO_URL } }
                    ]
                }
            }
        });
        variants.push('X2 hydrated template + tile header');
        // X3 — carousel, plain relay (floating picture cards)
        await relayInteractive(sock, chatId, senderJid, {
            carouselMessage: {
                cards: ['CARD ONE', 'CARD TWO'].map((label) => ({
                    header: { title: 'JOKER PROTO LAB · X3 ' + label, hasMediaAttachment: true, imageMessage: tile },
                    body: { text: label + ' — floating carousel card with picture attached.' },
                    footer: { text: 'X3 · carousel · image header' },
                    nativeFlowMessage: {
                        buttons: [
                            { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: 'Quick reply', id: 'proto_x3_qr' }) },
                            { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: 'Open repo', url: REPO_URL }) }
                        ],
                        messageParamsJson: ''
                    }
                }))
            }
        }, 'experiment_card carousel');
        variants.push('X3 carousel (2 floating cards) + tile');
        // X4 — ancient buttonsMessage with picture header (headerType 2 = IMAGE)
        await relayContent(sock, chatId, senderJid, {
            buttonsMessage: {
                contentText: 'Ancient buttonsMessage with a picture header (headerType 2). Tile = media accepted. Most clients dropped this format in 2022 — that is the experiment.',
                footerText: 'X4 · legacy buttons · image header',
                headerType: 2,
                imageMessage: tile,
                buttons: [
                    { buttonText: { displayText: 'Quick reply (X4)' }, type: 1, id: 'proto_x4_qr' },
                    { buttonText: { displayText: 'Quick reply 2' }, type: 1, id: 'proto_x4_qr2' }
                ]
            }
        });
        variants.push('X4 legacy buttonsMessage + tile header');
    } else {
        variants.push('SKIPPED — image upload failed, no tile this round');
    }
    return sock.sendMessage(chatId, {
        text: 'MEDIA MATRIX SENT\n\n' + variants.join('\n') +
            '\n\nEvery picture in this lab is the same JOKER PROTO LAB tile. Other tile carriers today: W3/W4 (webview), P2/P3 (market), Q3 (poll), L4 (list). Reply with which ones show the picture.'
    });
}

function dashboardHtml() {
    return [
        '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">',
        '<style>*{box-sizing:border-box}body{margin:0;padding:14px;background:#0d0c12;color:#f7f2f7;font-family:Arial,Helvetica,sans-serif}',
        '.wrap{max-width:680px;margin:auto;border:1px solid #49303d;border-radius:18px;overflow:hidden;background:#15121a}',
        '.hero{padding:24px 18px;background:linear-gradient(140deg,#401224,#17121d 72%);border-bottom:1px solid #573143}',
        '.k{font-size:10px;letter-spacing:3px;color:#f09eb6}.title{font-size:30px;font-weight:900;letter-spacing:3px;margin:8px 0}.sub{font-size:11px;color:#c7b6c9;line-height:1.6}',
        '.body{padding:16px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.item{padding:12px;border-radius:11px;background:#201a26;border:1px solid #3b2a3c}.item b{display:block;font-size:12px}.item code{display:block;margin-top:7px;color:#f5a8bd;font-size:10px;overflow-wrap:anywhere}.item p{color:#c5b8c9;font-size:10px;line-height:1.5;margin:7px 0 0}',
        '.note{padding:12px;margin-top:13px;background:#281923;border:1px solid #523146;border-radius:11px;color:#dfc9d6;font-size:11px;line-height:1.6}.foot{padding:12px;text-align:center;font-size:9px;letter-spacing:2px;color:#8c7c92;border-top:1px solid #332535}',
        '@media(max-width:360px){body{padding:7px}.title{font-size:25px}.grid{gap:6px}.item{padding:9px}}',
        '</style></head><body><main class="wrap"><header class="hero"><div class="k">EXPERIMENTAL MESSAGE WORKSHOP</div><div class="title">JOKER / PROTO</div>',
        '<div class="sub">Research-only payloads for the active Baileys build.<br>These are format tests, not production bot UI.</div></header><section class="body"><div class="grid">',
        '<article class="item"><b>🧪 HTML primitive</b><code>.j mod proto html</code><p>HTML payload plus edit-replay compatibility experiment.</p></article>',
        '<article class="item"><b>📝 Rich response</b><code>.j mod proto rich</code><p>Structured Markdown, links, code and table rendering.</p></article>',
        '<article class="item"><b>🃏 Horizontal cards</b><code>.j mod proto cards</code><p>Experimental horizontal layout and action-row shape.</p></article>',
        '<article class="item"><b>🔘 Native Flow</b><code>.j mod proto flow</code><p>Quick reply, copy, URL and single-select button probes.</p></article>',
        '<article class="item"><b>📋 Legacy list</b><code>.j mod proto list</code><p>Older structured list-message compatibility.</p></article>',
        '<article class="item"><b>📊 Poll</b><code>.j mod proto poll</code><p>Native poll creation using the installed Baileys API.</p></article>',
        '<article class="item"><b>📅 Event</b><code>.j mod proto event</code><p>Native WhatsApp event-invitation message probe.</p></article>',
        '<article class="item"><b>✏️ Edit</b><code>.j mod proto edit</code><p>Standard edit compared with rich edit replay.</p></article>',
        '<article class="item"><b>🌐 Floating web views</b><code>.j mod proto webview</code><p>W1-W4: modern CTA vs legacy open_webview, with and without a picture.</p></article>',
        '<article class="item"><b>🛒 Market boxes</b><code>.j mod proto market</code><p>P1-P3: product card, catalog_message card and order box, floating commercial shapes.</p></article>',
        '<article class="item"><b>📊 Poll variants</b><code>.j mod proto polls</code><p>Q1 multi-select, Q2 twelve options, Q3 poll with a picture banner.</p></article>',
        '<article class="item"><b>📋 List variants</b><code>.j mod proto lists</code><p>L2-L4: two sections, long list, list with a picture banner.</p></article>',
        '<article class="item"><b>🖼️ Media matrix</b><code>.j mod proto media</code><p>X1-X4: which envelope shapes accept an attached picture.</p></article></div>',
        '<div class="note"><b>Download-prompt investigation</b><br><code>.j mod proto warning</code> sends a raw HTML probe and a second probe using edit replay. Neither claims to originate from Meta AI. Rendering differs by client and rollout.</div>',
        '<div class="note"><b>Full suite</b><br><code>.j mod proto all</code> sends several test messages, including a poll and event. Use only in a suitable chat.<br><br>For command list: <code>.j mod proto help</code></div>',
        '</section><footer class="foot">JOKER • PROTOCOL LAB • EXPERIMENTAL</footer></main></body></html>'
    ].join('');
}

function htmlTestPage(title, subtitle, detail) {
    return [
        '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">',
        '<style>*{box-sizing:border-box}body{margin:0;padding:18px;background:#101014;color:#f4edf4;font-family:Arial,Helvetica,sans-serif}',
        '.panel{max-width:650px;margin:auto;background:#19151e;border:1px solid #533043;border-radius:16px;overflow:hidden}.head{padding:22px;background:linear-gradient(140deg,#3a1123,#17131b);border-bottom:1px solid #573246}',
        '.tag{font-size:10px;letter-spacing:3px;color:#ef9db6}.title{font-size:24px;font-weight:800;margin:9px 0}.sub{font-size:12px;color:#d4c2d4}.body{padding:18px;font-size:13px;line-height:1.7}.box{padding:13px;border-radius:10px;background:#251923;border:1px solid #553044}.foot{padding:12px;text-align:center;color:#927f94;font-size:9px;letter-spacing:2px;border-top:1px solid #332735}</style>',
        '</head><body><main class="panel"><header class="head"><div class="tag">JOKER PROTOCOL LAB</div><div class="title">', title,
        '</div><div class="sub">', subtitle,
        '</div></header><section class="body"><div class="box">', detail,
        '</div><p>This payload does not assert a Meta AI origin. Client rendering is experimental.</p></section><footer class="foot">FORMAT TEST ONLY</footer></main></body></html>'
    ].join('');
}

async function sendHtmlProbe(sock, chatId, senderJid, mode = 'html', editReplay = true) {
    const isMenu = mode === 'menu';
    const html = isMenu ? dashboardHtml() : htmlTestPage(
        mode === 'raw' ? 'RAW HTML BASELINE' : 'HTML RENDER TEST',
        mode === 'raw' ? 'No origin metadata and no edit replay' : 'HTML primitive with compatibility replay',
        mode === 'raw'
            ? 'Baseline A. Observe whether WhatsApp shows a download-consent prompt.'
            : 'Baseline B. This variant sends the HTML envelope and replays it as a message edit.'
    );
    return sendRich(sock, chatId, senderJid, htmlEnvelope(html), editReplay);
}

async function sendRichProbe(sock, chatId, senderJid) {
    const markdown = [
        '# Structured Rich Response',
        '',
        '**Bold** · *italic* · inline code',
        '',
        'A normal link: [Joker repository](https://github.com/BrainMell/whatsapp-bot)',
        '',
        'JavaScript sample: const proto = "experimental"; console.log(proto);',
        '',
        '| Primitive | Probe |',
        '|---|---|',
        '| Markdown | Yes |',
        '| Code content | Yes |',
        '| Table | Yes |',
        '',
        '_Formatting depends on the WhatsApp client._'
    ].join('\n');
    return sendRich(sock, chatId, senderJid, richEnvelope([
        section({ __typename: 'FOATextPrimitive', text: '# JOKER PROTO LAB\nStructured response test' }),
        section({ __typename: 'GenAIMarkdownTextUXPrimitive', text: markdown, inline_entities: [] })
    ]), true);
}

function cardsSection() {
    const cards = [
        { title: 'HTML', label: 'Inspect HTML' },
        { title: 'Rich Text', label: 'Inspect Markdown' },
        { title: 'Native Flow', label: 'Inspect Buttons' }
    ];
    return {
        __typename: 'GenAIUnifiedResponseSection',
        view_model: {
            __typename: 'GenAIHScrollLayoutViewModel',
            primitives: cards.map(card => ({
                __typename: 'GenAI3PExtWidgetPrimitive',
                header: { __typename: 'GenAI3PExtWidgetStandardHeader', title: card.title },
                body: {
                    __typename: 'GenAI3PExtCalendarEventList',
                    ctas: [{
                        label: card.label,
                        state: 'PENDING',
                        kind: 'OTHER',
                        tool_call_id: randomUUID(),
                        toast: {
                            label: 'Visual experiment only. This CTA is not connected to a bot action.',
                            __typename: 'GenAI3PExtWidgetToast'
                        },
                        __typename: 'GenAI3PExtWidgetCTA'
                    }],
                    sections: []
                }
            }))
        }
    };
}

async function sendCardsProbe(sock, chatId, senderJid) {
    return sendRich(sock, chatId, senderJid, richEnvelope([cardsSection()]), true);
}

function nativeFlowButtons(kind) {
    const map = {
        quick: [{
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({ display_text: 'Quick reply test', id: 'proto_lab_quick_reply' })
        }],
        copy: [{
            name: 'cta_copy',
            buttonParamsJson: JSON.stringify({ display_text: 'Copy test code', id: 'proto_lab_copy', copy_code: 'JOKER-PROTO-TEST' })
        }],
        url: [{
            name: 'cta_url',
            buttonParamsJson: JSON.stringify({ display_text: 'Open repository', url: 'https://github.com/BrainMell/whatsapp-bot' })
        }],
        select: [{
            name: 'single_select',
            buttonParamsJson: JSON.stringify({
                title: 'Choose a probe',
                sections: [{
                    title: 'Protocol Lab',
                    rows: [
                        { title: 'HTML response', description: 'Experimental HTML primitive', id: 'proto_html' },
                        { title: 'Rich response', description: 'Markdown and table', id: 'proto_rich' },
                        { title: 'Cards', description: 'Horizontal layout probe', id: 'proto_cards' }
                    ]
                }]
            })
        }],
        webview: [{
            name: 'open_webview',
            buttonParamsJson: JSON.stringify({
                title: 'Open repository',
                link: {
                    url: 'https://github.com/BrainMell/whatsapp-bot',
                    in_app_webview: true,
                    view_once: false
                }
            })
        }],
        mixed: [
            { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: 'Quick reply', id: 'proto_lab_quick_reply' }) },
            { name: 'cta_copy', buttonParamsJson: JSON.stringify({ display_text: 'Copy code', id: 'proto_lab_copy', copy_code: 'JOKER-PROTO-TEST' }) },
            { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: 'Open repo', url: 'https://github.com/BrainMell/whatsapp-bot' }) }
        ]
    };
    return map[kind] || map.mixed;
}

async function sendNativeFlowProbe(sock, chatId, senderJid, kind = 'mixed') {
    const content = {
        interactiveMessage: {
            header: { title: 'JOKER PROTO LAB', hasMediaAttachment: false },
            body: {
                text: 'Native Flow probe: ' + kind + '. Button click responses are not wired to RPG actions yet.'
            },
            footer: { text: 'Experimental native-flow test' },
            nativeFlowMessage: { buttons: nativeFlowButtons(kind), messageParamsJson: '' }
        }
    };
    const generated = generateWAMessageFromContent(chatId, content, {
        userJid: getUserJid(sock, senderJid),
        messageId: makeId()
    });
    const additionalNodes = [{
        tag: 'biz',
        attrs: {},
        content: [{
            tag: 'interactive',
            attrs: { type: 'native_flow', v: '1' },
            content: [{
                tag: 'native_flow',
                attrs: {
                    v: '9',
                    name: kind === 'select' ? 'single_select' : kind === 'webview' ? 'open_webview' : 'mixed'
                }
            }]
        }]
    }];
    if (!String(chatId).endsWith('@g.us')) {
        additionalNodes.push({ tag: 'bot', attrs: { biz_bot: '1' } });
    }
    await sock.relayMessage(chatId, generated.message, {
        messageId: generated.key.id,
        additionalNodes
    });
    return generated;
}

async function sendLegacyListProbe(sock, chatId, senderJid) {
    const listType = proto?.Message?.ListMessage?.ListType?.SINGLE_SELECT ?? 1;
    const generated = generateWAMessageFromContent(chatId, {
        listMessage: {
            title: 'Joker Protocol Lab',
            description: 'Legacy list-message compatibility probe',
            buttonText: 'Open list',
            footerText: 'List responses are not wired to actions yet',
            listType,
            sections: [{
                title: 'Choose a probe',
                rows: [
                    { title: 'HTML', rowId: 'proto_html', description: 'Rich HTML primitive' },
                    { title: 'Rich response', rowId: 'proto_rich', description: 'Markdown and tables' },
                    { title: 'Native flow', rowId: 'proto_flow', description: 'Native button layout' }
                ]
            }]
        }
    }, {
        userJid: getUserJid(sock, senderJid),
        messageId: makeId()
    });
    await sock.relayMessage(chatId, generated.message, {
        messageId: generated.key.id,
        additionalNodes: [{
            tag: 'biz',
            attrs: {},
            content: [{ tag: 'list', attrs: { v: '2', type: 'product_list' } }]
        }]
    });
    return generated;
}

async function sendPollProbe(sock, chatId) {
    return sock.sendMessage(chatId, {
        poll: {
            name: 'Joker Proto Lab: which UI should we explore?',
            values: ['Rich HTML', 'Native Flow buttons', 'Rich text and tables'],
            selectableCount: 1
        }
    });
}

async function sendEventProbe(sock, chatId) {
    return sock.sendMessage(chatId, {
        event: {
            name: 'Joker Proto Lab test event',
            description: 'Experimental WhatsApp event-message compatibility test.',
            startDate: new Date(Date.now() + 60 * 60 * 1000),
            endDate: new Date(Date.now() + 2 * 60 * 60 * 1000),
            extraGuestsAllowed: false
        }
    });
}

async function sendEditProbe(sock, chatId) {
    const original = await sock.sendMessage(chatId, {
        text: 'JOKER PROTO LAB\nEdit probe A: original message.'
    });
    await sock.sendMessage(chatId, {
        text: 'JOKER PROTO LAB\nEdit probe B: the message was edited in place.',
        edit: original.key
    });
    return original;
}

async function runWarningCompare(sock, chatId, senderJid) {
    await sendHtmlProbe(sock, chatId, senderJid, 'raw', false);
    await sendHtmlProbe(sock, chatId, senderJid, 'html', true);
    return sock.sendMessage(chatId, {
        text: 'JOKER PROTO LAB\nDownload-prompt A/B test sent. Compare the raw HTML baseline with the edit-replay variant. Both omit forwardOrigin metadata. Note which displays immediately and which, if any, asks for Download.'
    });
}

// The JOKER mod menu (owner 2026-10-29: "mod proto should pull up a menu").
// Canonical copy lives here; the identical template in adminConsole.js's
// original protomenu block is unreachable dead code since the lab took over
// the 'proto'/'protomenu' routing.
function modMenuHtml() {
    return `<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
*{box-sizing:border-box} body{margin:0;padding:18px;background:#101014;color:#f5f1f5;font-family:Arial,Helvetica,sans-serif}
.shell{max-width:680px;margin:auto;border:1px solid #44303b;border-radius:18px;overflow:hidden;background:#15131a}
.hero{padding:24px 18px;text-align:center;background:linear-gradient(135deg,#260e19,#111116 68%);border-bottom:1px solid #593040}
.mark{font-size:12px;letter-spacing:4px;color:#e9a7b2}.name{font-size:34px;font-weight:900;letter-spacing:5px;margin:8px 0;color:#fff}.sub{font-size:11px;letter-spacing:2px;color:#c9a4af}.meta{margin-top:16px;font-size:12px;color:#d4c8d0}.meta b{color:#f3c3ce}
.content{padding:18px}.eyebrow{font-size:11px;letter-spacing:2px;color:#e27b91;margin:0 0 12px}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
.card{padding:13px 11px;border:1px solid #382b38;border-radius:11px;background:#1d1922;min-height:72px}
.card .icon{font-size:19px;margin-bottom:7px}.card strong{display:block;font-size:12px;letter-spacing:.4px}.card span{display:block;margin-top:5px;font-size:10px;line-height:1.4;color:#bcb0bf}
.feature{margin-top:16px;padding:15px;border-radius:12px;background:#25151e;border:1px solid #573043}.feature strong{font-size:12px;color:#f0b0c0}.feature p{margin:7px 0 0;font-size:11px;line-height:1.6;color:#d7cbd6}
.footer{text-align:center;padding:14px;border-top:1px solid #302631;color:#8e8291;font-size:10px;letter-spacing:1px}
@media(max-width:360px){body{padding:8px}.content{padding:12px}.grid{gap:6px}.card{padding:10px 8px}.name{font-size:27px}}
</style>
</head>
<body><main class="shell">
<header class="hero"><div class="mark">♠ THE PHANTOM COMMAND SYSTEM ♠</div><div class="name">JOKER</div><div class="sub">MODERATOR TERMINAL · PROTOTYPE</div><div class="meta"><b>VERSION 5.3.4</b> &nbsp;·&nbsp; BY MELLOW<br><br>PREFIX &nbsp; <b>.j</b></div></header>
<section class="content"><p class="eyebrow">▸ SELECT A DESTINATION</p><div class="grid">
<div class="card"><div class="icon">🧬</div><strong>RPG</strong><span>Character control and progression</span></div>
<div class="card"><div class="icon">🏗️</div><strong>FORGE</strong><span>Classes, skills and enemy tools</span></div>
<div class="card"><div class="icon">⚔️</div><strong>GUILD WAR</strong><span>War state and test skirmishes</span></div>
<div class="card"><div class="icon">🎴</div><strong>CARDS</strong><span>Spawns, tokens and eShop</span></div>
<div class="card"><div class="icon">🧪</div><strong>SANDBOX</strong><span>Test character and godmode</span></div>
<div class="card"><div class="icon">🎯</div><strong>QUIZ</strong><span>Quiz sessions and configuration</span></div>
<div class="card"><div class="icon">🛡️</div><strong>MANAGEMENT</strong><span>Moderator roles and permissions</span></div>
<div class="card"><div class="icon">🧰</div><strong>TESTERS</strong><span>Issues, reports and test controls</span></div>
</div><div class="feature"><strong>✦ QUICK NAVIGATION</strong><p>Use <b>.j mod sandbox on</b> to enter the RPG test sandbox.<br>Use <b>.j mod &lt;category&gt;</b> to open a command category.<br>Use <b>.j mod &lt;command&gt;</b> to inspect a command.</p></div><div class="feature"><strong>⚠ EXPERIMENTAL HTML VIEW</strong><p>This is a visual prototype. The cards are not clickable yet. WhatsApp may render this experimental message differently across clients.</p></div></section><footer class="footer">JOKER · MAKE YOUR NEXT MOVE</footer></main></body></html>`;
}

const HELP = [
    'JOKER PROTOCOL LAB',
    '',
    '.j mod proto opens the JOKER mod menu (rich HTML, classic envelope).',
    '.j mod proto lab  The protocol-lab workshop dashboard (classic envelope)',
    '.j mod proto html  HTML primitive plus edit replay',
    '.j mod proto htmlraw  HTML primitive without edit replay',
    '.j mod proto warning  A/B test for the download prompt',
    '.j mod proto rich  Structured response with Markdown, links and table',
    '.j mod proto cards  GenAI horizontal-card/action-row probe',
    '.j mod proto flow  Mixed native-flow buttons',
    '.j mod proto flow quick  Native quick reply',
    '.j mod proto flow copy  Copy-code button',
    '.j mod proto flow url  URL button',
    '.j mod proto flow select  Single-select menu',
    '.j mod proto flow webview  Single legacy open_webview CTA (W2 alone)',
    '.j mod proto list  Legacy list-message probe',
    '.j mod proto poll  Native poll (baseline single-select)',
    '.j mod proto event  Event invitation probe',
    '.j mod proto edit  Standard message edit',
    '.j mod proto webview  Floating web-view variants (W1-W4)',
    '.j mod proto market  Floating market boxes (P1-P3)',
    '.j mod proto polls  Poll variants (Q1-Q3, Q3 carries a picture)',
    '.j mod proto lists  Legacy list variants (L2-L4, L4 carries a picture)',
    '.j mod proto media  Picture-attach matrix (X1-X4)',
    '.j mod proto all  Run everything; every picture is the same lab tile',
    '',
    'Experimental formats may be rejected or render differently across clients.',
    'Native button responses and visual card CTAs are not wired to RPG actions yet.'
].join('\n');

async function handleProtoLab(sock, chatId, senderJid, args = [], BOT_MARKER = '') {
    const sub = String(args[0] || 'menu').toLowerCase();
    const kind = String(args[1] || 'mixed').toLowerCase();
    try {
        switch (sub) {
            case 'help':
            case 'tests':
                return await sock.sendMessage(chatId, { text: BOT_MARKER + HELP });
            case 'menu':
            case 'protomenu':
                // owner 2026-10-29: bare .j mod proto / protomenu must open the
                // MOD MENU, not the lab workshop.
                // owner 2026-10-30: edit-replay delivery renders as an
                // "update WhatsApp" prompt on his client — menu goes back to
                // the CLASSIC 8efe5aede envelope (forwarded origin, no replay).
                return await sendClassicHtml(sock, chatId, senderJid, modMenuHtml());
            case 'lab':
            case 'workshop':
            case 'dashboard':
                return await sendClassicHtml(sock, chatId, senderJid, dashboardHtml());
            case 'html':
                return await sendHtmlProbe(sock, chatId, senderJid, 'html', true);
            case 'htmlraw':
            case 'raw':
                return await sendHtmlProbe(sock, chatId, senderJid, 'raw', false);
            case 'warning':
            case 'download':
                return await runWarningCompare(sock, chatId, senderJid);
            case 'rich':
            case 'markdown':
            case 'table':
                return await sendRichProbe(sock, chatId, senderJid);
            case 'cards':
            case 'carousel':
                return await sendCardsProbe(sock, chatId, senderJid);
            case 'flow':
            case 'native':
                return await sendNativeFlowProbe(sock, chatId, senderJid, kind);
            case 'quick':
            case 'copy':
            case 'url':
            case 'select':
                return await sendNativeFlowProbe(sock, chatId, senderJid, sub);
            case 'list':
            case 'legacylist':
                return await sendLegacyListProbe(sock, chatId, senderJid);
            case 'poll':
                return await sendPollProbe(sock, chatId);
            case 'polls':
                return await sendPollSuite(sock, chatId);
            case 'lists':
                return await sendListSuite(sock, chatId, senderJid);
            case 'webview':
            case 'webviews':
                return await sendWebviewSuite(sock, chatId, senderJid);
            case 'market':
            case 'shop':
                return await sendMarketSuite(sock, chatId, senderJid);
            case 'media':
            case 'pictures':
                return await sendMediaSuite(sock, chatId, senderJid);
            case 'event':
                return await sendEventProbe(sock, chatId);
            case 'edit':
                return await sendEditProbe(sock, chatId);
            case 'all': {
                const tests = [
                    ['HTML plus edit replay', () => sendHtmlProbe(sock, chatId, senderJid, 'html', true)],
                    ['Structured rich response', () => sendRichProbe(sock, chatId, senderJid)],
                    ['Horizontal cards', () => sendCardsProbe(sock, chatId, senderJid)],
                    ['Native-flow buttons', () => sendNativeFlowProbe(sock, chatId, senderJid, 'mixed')],
                    ['Legacy list', () => sendLegacyListProbe(sock, chatId, senderJid)],
                    ['Poll', () => sendPollProbe(sock, chatId)],
                    ['Event', () => sendEventProbe(sock, chatId)],
                    ['Edit', () => sendEditProbe(sock, chatId)],
                    ['Webview variants', () => sendWebviewSuite(sock, chatId, senderJid)],
                    ['Market boxes', () => sendMarketSuite(sock, chatId, senderJid)],
                    ['Poll variants', () => sendPollSuite(sock, chatId)],
                    ['List variants', () => sendListSuite(sock, chatId, senderJid)],
                    ['Media matrix', () => sendMediaSuite(sock, chatId, senderJid)]
                ];
                const results = [];
                for (const [name, test] of tests) {
                    try {
                        await test();
                        results.push('OK  ' + name);
                    } catch (error) {
                        console.error('[ProtoLab] ' + name + ' failed:', error?.stack || error);
                        results.push('FAILED  ' + name + ': ' + (error?.message || String(error)));
                    }
                }
                return await sock.sendMessage(chatId, {
                    text: BOT_MARKER + 'PROTO LAB SUITE RESULTS\n\n' + results.join('\n') +
                        '\n\nA successful relay does not guarantee that the recipient client renders that format.' +
                        '\nMedia probes: every picture is the JOKER PROTO LAB tile — note which messages show it.'
                });
            }
            default:
                return await sock.sendMessage(chatId, {
                    text: BOT_MARKER + 'Unknown proto probe: ' + sub + '\n\n' + HELP
                });
        }
    } catch (error) {
        console.error('[ProtoLab] ' + sub + ' failed:', error?.stack || error);
        return await sock.sendMessage(chatId, {
            text: BOT_MARKER + 'Protocol probe failed: ' + sub + '\n' +
                (error?.message || String(error)) +
                '\n\nThe feature may not be supported by this Baileys build or WhatsApp client. Try .j mod proto help.'
        });
    }
}

module.exports = { handleProtoLab };

// QA hook: construction-only access to the suite builders (mock sock).
module.exports._qa = { sendWebviewSuite, sendMarketSuite, sendPollSuite, sendListSuite, sendMediaSuite, adReplyThumbnail, makeDigits };
